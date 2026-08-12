# Tournament Manager

Software for organisers to run pickleball **tournaments** (one-off or weekend events):
**entries, draws, live scores** — plus court/time scheduling, which is half the product's value.

This is a **separate product** from PBTable (club nights) and the Inter-County League
(season-long team league). Separate folder, separate Supabase project, separate `.mcp.json`.
It must never touch either sibling database. Background and rationale: [HANDOFF.md](HANDOFF.md).

The customer is the **organiser**: public read-only pages for everyone, writes behind
organiser login. Player self-service (online entry, payment) is phase 2 — modelled for,
not built.

## Decisions — locked with Paul, 2026-08-10

All seven blocking questions from HANDOFF §6 answered, plus the secondary ones:

1. **Formats at launch: pools → single-elim knockout.** Round-robin pools feed a seeded
   knockout bracket. The bracket is modelled with `winner_advances_to` /
   `loser_advances_to` self-references from day one so double elimination / back draws are
   an addition, not a rebuild. Straight single-elim falls out of the same engine (zero or
   skipped pool stage); neither double-elim nor box-only days are built in v1.
2. **Entry unit: singles AND doubles at launch.** Events are men's/women's/mixed doubles
   plus singles. An entry is (player | pair) × event; one player can enter multiple events —
   so cross-event schedule clashes must be prevented (see 7).
3. **Banding: free-text band label per event** (e.g. "3.0–3.5", "50+"). Optional,
   organiser-defined; no structured validation against ratings/DOB in v1.
4. **Seeding: rating-based, organiser can override.** Default seed order comes from ratings
   with provenance (source + value + captured_on — DUPR vs self-assessed are different
   claims; the organiser picks which source wins), then reorder before the draw is
   generated. The generated draw records the seeds used.
5. **Match scoring: configurable per event AND per stage.** e.g. single game to 15 in
   pools/early rounds, best-of-3 to 11 win-by-2 from the semis. Never global, never
   hardcoded.
6. **Entries are organiser-entered in v1** (typed or CSV-imported with fuzzy-match review).
   Self-service entry + Stripe payment is phase 2: model for it (entry has a status;
   fees per event conceivable) but build none of it.
7. **Scheduling: manual court + time-slot assignment with clash warnings.** The system
   warns when a player would be on two courts at once (across ALL their events) and when a
   court is double-booked, and shows a running day-length estimate (~20 min/game).
   Auto-scheduling is a later product in itself.
8. **Pool standings tie-breaks = the league's proven rules**: matches won, then games won,
   then points difference. Lives in a view so it's one-place-changeable.
9. **Day-of check-in is in v1**: a simple checked-in flag per entry, organiser-set, with a
   DB trigger backstop ("player must be checked in") before their matches can be scored.
   Withdrawals/no-shows handled by entry status.
10. **Three surfaces**: public read-only site, organiser admin, and a basic **TV/court-side
    display page** (auto-refreshing live draws, scores, "next on court N") — a demo asset.
11. **Supabase: new project in the existing `paulberry13-tech` org, free tier.** Paul
    creates the project himself (free-tier cap is 2 active projects/org — his call to
    manage). MCP server name: `supabase-tournaments`. Setup steps verbatim from
    `InterCounty-League/SETUP.md`.
12. **Palette: crimson + gold.** Deep championship crimson/burgundy hero, warm gold
    accents — "finals day" feel. Shared bones with the siblings: Barlow / Barlow
    Condensed, dark hero + light sections, PBTable logo. Distinct from navy+coral
    (PBTable) and indigo-violet+teal (league); racing-green+gold was rejected by Paul —
    never reuse.

## Schema (migrations in `supabase/migrations/` — written, NOT yet applied)

```
tournaments ─< events (discipline, category, band_label, scoring config × 3 stages)
tournaments ─< players (checked_in) ─< player_ratings (source + value + captured_on)
events ─< entries (status entered/waitlisted/withdrawn, seed) ─< entry_players
events ─< pools ─< pool_entries
events ─< matches (stage pool|bracket, bracket_kind main|consolation, round/slot,
                   winner_advances_to/_side, loser_advances_to/_side,
                   best_of/points_to/win_by copied from event at draw time,
                   court, scheduled_at) ─< games
tournaments ─< tournament_admins (project-wide) · tournament_settings (auto-created row:
               courts_count, slot_minutes, checkin_required_for_scoring, ratings_public)
views: player_current_ratings, match_results, pool_standings, schedule_clashes
```

- `001_core.sql` — tournaments, admins + `is_tournament_admin()`, settings (auto-row
  trigger), players, ratings, events + RLS
- `002_entries.sql` — entries/entry_players + integrity trigger (tournament match, size
  cap, gender rules, one-entry-per-player-per-event)
- `003_competition.sql` — pools, matches, games + triggers: cross-ref checks, scoring
  guard (sides set + check-in, setting-driven), **winner advancement**
  (`advance_after_result` → `fill_match_side`, refuses to disturb scored matches)
- `004_views.sql` — match_results, pool_standings (locked tie-breaks), schedule_clashes
  (same-slot court + player clashes, cross-event)

There is deliberately **no `game_players` table**: a tournament pair IS the entry
(unlike the league's rotating squads), so who-played comes from `entry_players`.

## Player self-service (phase 2, brought forward 2026-08-10)

Paul asked for the player-facing side early: signup, online entry, payment, partner
changes. Decisions locked while building — all in `005_player_self_service.sql`:

1. **A player account is cross-tournament** (one profile, many tournaments — the
   Pickleball Brackets model). `players` stays tournament-scoped and gained
   `account_id`; organiser-typed players have `account_id is null`, so nothing that
   already existed changed behaviour.
2. **Every player write goes through a SECURITY DEFINER rpc**, never an open RLS insert
   policy: `upsert_my_profile`, `register_for_event`, `respond_to_invitation`,
   `change_partner`, `cancel_my_invitation`, `withdraw_my_entry`, plus reads
   `my_invitations`, `my_event_options`, `find_partner`. Registration touches four
   tables atomically and carries real eligibility rules — RLS alone cannot hold that.
   Internal helpers (`eligibility_problem`, `ensure_player`, `account_rating`,
   `recalc_entry_status`, `age_for_tournament`) are **revoked from PUBLIC/anon/
   authenticated** — they take an arbitrary account id, so exposing them leaked other
   players' ratings. NOTE: `revoke ... from anon, authenticated` alone does nothing —
   Postgres grants EXECUTE to PUBLIC by default; you must revoke from PUBLIC.
3. **Fees are per player, not per entry** — this is what makes partner changes
   survivable. The entry row persists, `entry_players` swaps, and each person's payment
   follows the person: swap a partner after both paid and only the dropped player's fee
   flips to `refunded`; the one who stayed keeps `paid` and is never charged twice.
4. **`entries.status` gained `incomplete`.** An entry becomes `entered` only when the
   roster is full AND every player's fee is settled — enforced by
   `recalc_entry_status()` off triggers on `entry_players` and `entry_payments`, so the
   competitive state can never drift from the money. Over-capacity ready entries become
   `waitlisted`; a withdrawal promotes the longest-waiting one. Draw generation still
   only ever picks up `entered`.
5. **Sport nuances enforced in `eligibility_problem()`**: play UP but never DOWN
   (`events.max_rating` ceiling, applied to the partner too), age as of **31 Dec of the
   tournament year** (USA Pickleball convention — a December 50th birthday plays 50+ all
   season), `combined_rating_max` for pairs, gender rules, one entry per player per
   event (withdrawn doesn't block a re-entry), and "the draw has been made" closes an
   event to new entries.
6. **Payment = Stripe Checkout, per player.** `create-entry-checkout` (verify_jwt on)
   reads the amount from the caller's own `entry_payments` row — never from the client,
   so a tampered request cannot change the price. `entry-webhook` (verify_jwt off,
   secured by signature) only has to mark a payment `paid`; the DB trigger does the
   rest. Both **deployed**; they return a clear 503 naming the missing secret until
   `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are set. `PAYMENTS_LIVE` at the top of
   `enter.html` flips the UI from "pay the organiser" to real checkout.
7. **Organiser stays the authority**: players cannot check themselves in
   (`guard_player_self_update`), and cannot alter a roster once the draw exists
   (`guard_entry_players_after_draw`) — but the **admin is exempt** from that guard,
   because a day-of partner substitution is a real thing organisers must be able to do.

## Hard rules (learned expensively — HANDOFF §4, apply from day one)

- **Never key on player name.** IDs only; scope queries by tournament.
- **Gender is structural**: `male`/`female`/`other`, full words, never M/F/O. Triggers
  block unambiguous violations; `other` passes at DB level — policy is a UI decision.
- **Never resolve a name from a stage-scoped list** — one tournament-wide lookup map,
  loaded once (the league's "TBC" bug).
- **Verify schema with column-level checks against `information_schema`**, never the
  migration ledger. Smoke-test with self-rolling-back `DO` blocks ending in
  `raise exception 'TEST -> %'`.
- RLS everywhere: public read + admin write via `is_admin()`-style SECURITY DEFINER
  (`search_path = ''` pinned on ALL functions, schema-qualified internals). Bootstrap the
  first admin by dashboard insert; policies must prevent self-appointment.
- Views with `security_invoker = on`; scoring/standings rules live in views.
- Admin UI: every input gets a label saying what it IS and a hint saying what it's FOR;
  `time`/`number` included in the styled-input selector from the start; "Pending" is the
  empty-state word; wizards show live consequences (court/duration estimate).
- Deploy model: single-file no-build HTML per surface (`index.html`, `admin.html`,
  display page), supabase-js from CDN, publishable key embedded (RLS protects),
  Netlify-ready; `.claude/launch.json` → `npx http-server site -p <port> -c-1`.
- Demo data: seeded set-based in SQL, always tagged (`notes='Demo data'`), fictitious
  names. Build the polished demo tournament early — it's the sales asset.
- Score entry: create every match/game row up front where possible; keyboard flow
  (score ⏎ score ⏎ = save + jump); per-row save dots; "Save all entered"; `beforeunload`
  guard; DB errors on the row. Tournament twist: saving a deciding score **advances the
  winner into their next bracket slot** (and loser, once back draws exist).

## References (copy deliberately, never import)

- `InterCounty-League/` — CLAUDE.md (decision-log format), SETUP.md (infra checklist),
  migrations 001–009 (RLS/trigger/view patterns), site/admin.html (score-entry flow).
- `Desktop/PBTable-Production/site/index.html` — `fuzzyMatch` + `FuzzyMatchReview` (CSV
  import), RDR engine (`replayAllSessions`, `ratingK`, `R_D`, `R_KMIN/KMAX/KHALF`,
  `R_ALPHA`, `WIN_FLOOR`) if tournament ratings are ever wanted.
- Do NOT reuse: PBTable's `clubs`/`club_admins` RLS shape, its booking layer, the
  league's promotion/relegation ladder.

## Supabase project

- Org: `paulberry13-tech` (free tier). **Created 2026-08-10.**
- Ref: `fvyjvoimezsfrndydzkt` — URL `https://fvyjvoimezsfrndydzkt.supabase.co`
  (already in `.mcp.json` as server `supabase-tournaments`).
- Publishable (client/anon) key: `sb_publishable_k80t7cu9oPN9Q5r8OO3Y-w_Wk3c_mOV`
  (safe to embed — RLS protects; already filled into both site files 2026-08-10).
- MCP: `supabase-tournaments` enabled in `~/.claude.json` + OAuth done — **✔ Connected
  per Paul 2026-08-10**. NOTE: sessions started before the connection can't see it;
  REST probe with the publishable key confirmed URL+key valid (404 PGRST205 pre-migration).

## Status

- 2026-08-10: handoff reviewed with Paul; all §6 decisions + palette + secondary questions
  locked (this file).
- 2026-08-10: **migrations 001–004 written** (see Schema above) — not applied; no Supabase
  project exists yet. Paul is creating it (SETUP.md is the checklist; `.mcp.json` has a
  placeholder ref to fill in). Apply + column-level verify + rollback smoke tests (list at
  foot of SETUP.md) happen the moment `supabase-tournaments` shows ✔ Connected.
- 2026-08-10: **public site first cut** — `site/index.html`, single-file no-build,
  crimson+gold palette (tokens at top of the file), Barlow / Barlow Condensed, PBTable
  logo (`site/pbtable-logo.png`). Sections: Events (cards with band pill + per-stage
  format line), Draws & results (event chips → pool cards with standings + match results
  band, knockout bracket as scrolling round columns, gold-highlighted winners, consolation
  block ready), Schedule (slot/court table). Tournament picker appears when >1 tournament;
  `?t=<id>` deep-links one. "Pending" is the empty-state word everywhere. Supabase
  URL/key are `REPLACE_WITH_*` placeholders → the page shows a "not connected yet" banner
  until filled. Verified in browser (unconfigured state, no console errors) at
  http://localhost:8199 via `.claude/launch.json` (`npx http-server site -p 8199 -c-1`).
  Names always resolve through tournament-wide maps loaded once in `boot()` — never from
  stage-scoped lists (league "TBC" lesson).
- 2026-08-10: **organiser admin first cut** — `site/admin.html`, single-file, same
  palette. Auth gate (email/password + `is_tournament_admin` RPC; non-admins signed
  straight back out). Tournament list/create, then seven tabs:
  - **Setup** (details + the four settings, each labelled with what it's FOR),
  - **Events** (create/edit incl. the 3-stage format fieldsets, delete with cascade warning),
  - **Players** (add with optional first rating, add ratings with provenance, day-of
    check-in toggles + n/m pill),
  - **Entries** (per-event chips; add entry with gender-filtered pickers, status select,
    editable seeds — locked once a draw exists; auto-seed by the event's rating source,
    pairs seeded on average rating),
  - **Draw** (generate: snake-seed into pools, round-robin pool matches, bracket sized to
    next power of two over qualifiers, **built final-first so `winner_advances_to` links
    exist at insert**, byes resolved at fill time, ALL game rows created up front; live
    day-length estimate line; "Fill bracket from pool standings" unlocks when every pool
    match is decided — cross-seeded A1/B2 style, second ranks reversed; delete draw),
  - **Schedule** (per-row court + datetime saves-on-change with dots; clash panel reads
    the `schedule_clashes` view — warns, never blocks),
  - **Scores** (league keyboard flow: score ⏎ score ⏎ = save + jump; per-row dots +
    row-level DB errors; "Save all entered"; beforeunload guard via dirty counter; winner
    computed from games won vs best_of and written to `winner_entry_id` — the DB trigger
    does the advancement).
  **Untested beyond the unconfigured-state render** (verified no console errors) — every
  DB-touching path needs the live project. First session with `supabase-tournaments`
  connected must walk the whole flow: create tournament → event → players → entries →
  generate draw → schedule → scores → check advancement + clashes.
- 2026-08-10: **migrations 001–004 applied and verified.** Paul ran them via the dashboard
  SQL editor; verified by column-level checks against `information_schema` (12 tables +
  4 views, expected column counts), RLS on with 2 policies per table, all 6 triggers
  present. NOTE: `supabase-tournaments` MCP tools hot-loaded into the running session
  after Paul's OAuth — a restart wasn't needed after all.
- 2026-08-10: **smoke tests passed** (three self-rolling-back DO blocks, DB back to zero
  rows): settings auto-row; all five entry rules (female-in-mens, third-on-doubles,
  twice-in-event, two-males-in-mixed as a multi-row insert, second-on-singles) rejected;
  check-in guard blocks scoring then allows after check-in; winner advancement fills the
  final from both semis; a scored final refuses side changes; checkin-off setting path
  scores without check-in; pool standings resolve an all-1-1 pool on points difference
  (A +5 / C −1 / B −4). Anon REST: read 200 `[]`, write 401 RLS violation. Security
  advisors: only the two accepted `is_tournament_admin` SECURITY DEFINER warnings.
- 2026-08-10: **both site files wired** to the live project (URL + publishable key);
  public site verified in browser against the live DB — connects cleanly, shows the
  "no tournament published yet" state, no console errors.
- 2026-08-10: first admin bootstrapped — `paul@pbtable.co.uk`
  (`4c8aa96d-3374-4025-8b76-5b5803c15ca3`) in `tournament_admins`. Paul created a test
  tournament through the admin UI (so tournament-create + auth gate work live); removed
  at his request when demo data landed.
- 2026-08-10: **demo tournaments seeded** (SQL via MCP, all rows `notes='Demo data'`,
  fictitious names):
  - **Cotswold Autumn Classic** (26 Jul 2026, Cheltenham Sports Hub, 6 courts) —
    COMPLETED showcase. 20 players (12M/8F, DUPR ratings + two `self` for provenance),
    3 events exercising every format: Mixed Doubles 3.0–3.5 (8 pairs, 2 pools →
    semis+final), Men's Doubles Open (6 pairs, 2 pools of 3 — different pairings than
    mixed, players in multiple events), Women's Singles 3.5+ (5 into 1 pool → final).
    35/35 matches decided; finals were filled by the DB advancement trigger (asserted in
    the build script). Full schedule: courts 1–5, pool grids staggered so cross-event
    shared players never share a slot — `schedule_clashes` = 0. (First attempt used a
    35-min grid that intersected the 40-min grid at 10:50 → the clash view caught it —
    good live proof.) Champions: Dan Prescott & Megan Coleford (mixed), Dan Prescott &
    Ollie Marsh (mens — the double), Freya Dunmore (womens singles).
  - **Severn Vale Winter Open** (14 Nov 2026, Gloucester Indoor Arena) — UPCOMING.
    16 players (mixed DUPR/self rating provenance), 3 events, 17 entries incl.
    waitlisted ones; unseeded, no draws — every Pending state + the auto-seed/draw/
    schedule/score walkthrough can be demoed live on it.
  - Public site verified rendering both (picker, standings, brackets, schedule).
- 2026-08-10: **admin delete controls completed** per Paul — every admin-created thing
  is now deletable: tournament (Setup tab "Danger zone", type-the-name confirm), player
  (deletes their entries + ratings with it), entry (per-row on Entries tab), individual
  ratings (× in the ratings form), plus the existing event delete and draw delete.
  Deletes that would orphan a generated draw are refused by the matches FK (no cascade
  on match sides — deliberate) and the UI surfaces "delete the draw first / mark
  withdrawn instead". Verified page parses + renders sign-in clean; behind-auth clicks
  still need the walkthrough.
- 2026-08-10: **player self-service built, applied and stress-tested** (migrations
  `005a`–`005h`; see the section above for the locked decisions). New surface
  `site/enter.html` — single-file, same palette: email+password or magic-link sign-in,
  one cross-tournament profile, event list with **per-event eligibility resolved server
  side** (`my_event_options` — one round trip, reasons shown in place of an Enter
  button), enter with a named partner (live `find_partner` lookup) or "partner TBC",
  invitations inbox with accept/decline, per-entry progress strip
  (Entered → Partner → Fee → In the draw), pay / change partner / cancel invite /
  withdraw with refund-deadline wording. Admin gained an **Online entry** card (master
  switch, partner-TBC toggle, open/close/withdrawal datetimes, currency, refund policy),
  per-event **entry rules & fee** fieldset (fee, capacity, rating ceiling/floor, combined
  cap, age band) and a **Fees column** on Entries with "Mark paid" for cash/bank
  payments. Public site shows an "Enter online" nav chip only while entries are open.
- 2026-08-10: **five self-rolling-back stress blocks all pass** (DB left clean, zero
  leftover TEST rows). Covered: profile gate · self-service gate · closing date ·
  duplicate entry · gender rules · play-up allowed / play-down blocked **for the partner
  too** · same-gender mixed pair · combined-rating cap (exact-cap pair allowed, over-cap
  refused) · age band incl. the 31-Dec rule · partner-self · invitation sent to the wrong
  person · invitation reuse · **per-player fees gating the entry** (half-paid stays
  incomplete) · **partner swap after both paid → only the dropped player refunded** ·
  re-partner and pay → entered, first player never charged twice · decline · capacity
  waitlisting · waitlist promotion on withdrawal · refund before/after deadline ·
  cross-player withdrawal blocked · self-check-in blocked · post-draw roster locked for
  players but open to the organiser · invite-then-signup (matched on email) · re-entry
  after withdrawal · partner sees the withdrawal · **internal helpers unreachable from
  the web roles** (no rating snooping, no player-row spoofing).
- 2026-08-10: **walked the real UI end to end** as demo players, not just SQL. Rachel →
  invited Tom → Tom accepted → entered (free event); Rachel → £15 women's doubles →
  Nadia accepted → both paid → entered → **swapped Nadia for Sian after payment** →
  entry dropped to incomplete, Nadia refunded, Rachel still paid → Sian accepted and
  paid → entered. Two real bugs found and fixed this way: (a) an event whose draw was
  already generated still offered an Enter button and only failed after the partner
  email was typed — `eligibility_problem` now closes drawn events; (b) the checkout
  function's CORS did not allow `x-client-info`, which `functions.invoke` always sends —
  header added and the page now uses a direct fetch so the 503 body is actually shown.
  Also confirmed the admin gate signs a **player** account straight back out.
- 2026-08-10: **demo player logins** (fictitious, password `PickleDemo!2026`):
  rachel.vance@ (F 3.40, 54) · tom.alderney@ (M 3.30, 56) · priya.raval@ (F 4.10, 31) ·
  jon.mercer@ (M 3.95, 38) · nadia.kerr@ (F 3.20, 48) · gordon.pike@ (M 3.55, 58) ·
  sian.rowe@ (F 3.45, 43), all `@demo.invalid`. Winter Open is the live online-entry
  demo: entries open, £15 mixed (cap 8, combined 8.50), £12 men's singles (4.00
  ceiling), £15 women's doubles (3.50 ceiling), free Mixed 50+ (age band).
- 2026-08-11: **visual pass — levelled cards + a drawn mark set.** Paul: "level out the
  boxes… the interface is a bit bland."
  - **Alignment:** event cards on both `index.html` and `enter.html` are now an
    equal-height grid (`grid-auto-rows:1fr`) where each card is a flex column with a
    `.grow` spacer, so the entry count / fee / CTA sit on a shared baseline however much
    text is above them. Measured: entry page went from ragged 117 vs 144 px to four cards
    at 205 px with footers at an identical 64 px from the bottom. Admin **score entry**
    had the same disease for a different reason — a best-of-3 row has three pairs of
    boxes and a single-game row has one, so a centred cell made the boxes drift row to
    row; game slots are now fixed-width (`.game-slot`, 152px) and left-aligned, which
    pins game 1 to the same column on every row.
  - **Graphics: hand-drawn inline SVG, deliberately not generated raster images** — the
    surfaces are single-file no-build pages bound for Netlify, so SVG keeps them
    self-contained (no extra requests or binary assets), stays crisp at any size and
    inherits the crimson/gold palette via `currentColor`. Seven symbols in a sprite at
    the top of each file, reused with `<use>`: paddle, two-paddles (doubles), perforated
    ball (holes punched with `fill-rule="evenodd"`), **court drawn to real proportions**
    (44×20 ft, 7 ft non-volley zone, centred net — accuracy matters when organisers look
    at it), trophy, player, envelope. Applied as: hero court watermark + ball at ~13%/10%
    gold opacity, a mark in each `h2`, a discipline mark on every event card, and the
    paddle in every empty state. Admin stays deliberately plainer.
  - A reference sheet of the marks + palette lives at
    `scratchpad/graphics-sheet.html` (deliberately NOT in `site/` — that folder ships to
    Netlify and should hold only the three surfaces plus the logo).
  - **Paddle redrawn 2026-08-11** — Paul: "the paddles need to look more like pickleball
    paddles." The first attempt was a domed lollipop that read as a table-tennis bat.
    The distinguishing feature is that a pickleball paddle is **angular**: a broad face
    with big rounded corners, taller than wide (~11" x 8" → the mark uses 10.6 x 13.8 in
    a 24 box, a 0.77 ratio), pinching into a throat, then a chunky grip with a flared
    butt cap. Built from four simple shapes rather than one clever path so it stays
    legible at 18px. The doubles mark is that same paddle twice at ±17°, back one at 45%
    opacity for depth. Verified by measuring every sub-shape's bbox — nothing clips the
    viewBox and the rotated pair spans x 1.0–22.9.
- 2026-08-12: **entry page reworked around the link, not a picker** (`006_tournament_slugs`,
  `006b_invitation_context`). Paul's point: an organiser advertises a link, so the player
  has already chosen their tournament before they arrive — a dropdown in the hero only
  invites entering the wrong event.
  - `tournaments.slug` (unique, auto-generated from the name by trigger, organiser-
    editable). A UUID cannot be read out on a poster or typed; a slug can.
  - **Arrival rules in `boot()`**, in order: an `?invite=` token resolves its own
    tournament (via the new `invitation_context` rpc — SECURITY DEFINER, public, because
    the token is the secret and the holder already has it, so it works **signed out**) →
    `?t=` slug-or-id **locks** the page, no picker → no link and exactly one tournament
    open goes straight in → otherwise a chooser *screen* of cards (dates, venue), never
    a `<select>`. A bad slug gets a plain explanation plus the same list.
  - `selectTournament()` rewrites the address bar to the canonical `?t=<slug>` so a
    bookmark or forwarded link behaves identically.
  - The hero's only remaining control is an escape hatch ("Not the right event?"), shown
    solely when another tournament is actually open.
  - Signed-out arrival from an invitation now leads with **"Gordon has asked you to
    partner them"**, the event, and which email to sign in with.
  - Admin Setup gained a **"The link to advertise"** box: absolute URL, copy button, open
    button, and an editable link name warning that changing it breaks shared links.
  - `site/_redirects` ships Netlify rewrites for `/enter/:slug` and `/t/:slug`; the app
    keeps generating the `?t=` form, which works locally and in production either way.
  - Verified all four arrival routes in the browser: slug link locks (no `<select>` in the
    DOM), no-param auto-selects the single open tournament and canonicalises the URL,
    a bad slug shows the chooser with a warning, and a pending invite token resolves the
    tournament while signed out.
- 2026-08-12: **entry rebuilt as a multi-event basket** + form alignment fixed. Paul:
  "the player entry is quite confusing… have a re-think as to how a player can sign up
  for multiple events on one page."
  - **The insight the old flow missed:** a player enters two or three events in one
    sitting and usually with a **different partner in each** (mixed with one person,
    men's doubles with another). One-at-a-time "Enter" buttons fought that.
  - New builder: every event is a row with a tickbox; ticking one opens a partner field
    **for that event**; a sticky basket bar shows the events chosen and the running total
    of *your share*; one "Confirm N entries" button. Nothing is written until confirm.
  - **Partial success is the honest outcome** — `register_for_event` is called per event
    and each result reported separately, so one bounce (partner over the ceiling, wrong
    gender for mixed) does not lose the others. Failed rows **stay ticked** with their
    partner still filled in so the player fixes rather than restarts.
  - Ineligible and already-entered events stay visible but unselectable, showing the
    reason or the entry's own status — using the same `entryStage()` wording as "Your
    entries" so one event is never described two ways on one page.
  - Page order now follows intent: invitations → your entries (hidden entirely when
    empty, so a new player lands straight on the builder) → enter events → profile,
    tucked into a `<details>`.
  - **Form alignment:** `.frow` was flex, so every field sized to its own content and the
    right-hand edges never lined up — this is what Paul kept seeing. Now a grid of equal
    columns (`repeat(auto-fit,minmax(210px,1fr))`, `max-width:none` inside) on BOTH
    `enter.html` and `admin.html`. Measured: 8 profile fields, all exactly 277px, on 3
    clean left and right edges.
  - Cleared the leftover test draw on Winter Open → Mixed Doubles Open, restoring the
    documented "nothing drawn" demo state (regenerate any time from the Draw tab).
- 2026-08-12 (later): **the alignment fault was vertical, not horizontal.** Paul sent a
  screenshot: equal widths, but the boxes started at different heights because a one-line
  hint ("As you want it to appear in the draw.") and a two-line one ("Decides which men's
  / women's / mixed events you can enter.") pushed their inputs down by different amounts.
  Fix: each `label.f` is a flex column stretched to the grid row, with the input pushed
  down by `margin-top:auto`, so the boxes bottom-align whatever the hint does — **plus a
  pinned `height`**, because `select` and `input[type=date]` are intrinsically a few px
  different from a text input, which was still knocking rows out by 2–3px. Measured
  after: every row one shared top, one height (42px), one width (277px). Both
  `enter.html` and `admin.html`. **Lesson for this codebase: when fields look ragged,
  check the hint line-count and the control type before touching widths.**
- 2026-08-12: **"Your details" moved to the top of the entry page — Paul's call, twice
  asked, and he was right.** My first answer kept it tucked at the foot with a separate
  prompt card only when something was missing; he came back with a screenshot showing it
  still at the bottom. Now it is the **first element on the page**, as a `<details>`:
  - complete profile → collapsed, 59px, one line, summary reads "Your details — Jon
    Mercer · DUPR 3.95" with a green **Complete** pill, so it costs almost nothing above
    the events;
  - something missing → **opens itself**, an amber "N events blocked" pill in the summary
    and the specific reasons listed ("add your rating…", "add your date of birth…").
  The separate gap card was removed — two things saying the same was worse than one.
  Rationale worth keeping: eligibility for every event is derived from gender, rating and
  date of birth, so the profile genuinely is the gate; a brand-new player still cannot
  see the event list at all until it is saved. Per-event blocking stays as it is — a
  player with no DOB can still legitimately enter the events that have no age band, so
  locking the whole builder would be wrong.
- 2026-08-12: **QR code + the payments section built out** (`007_payment_method`,
  `007b_my_fees_still_in`).
  - **QR** next to the share link on the admin Setup tab, at 132px, with "Download for a
    poster" producing a 1024px PNG. Encoder is `qrcode-generator` from CDN (organiser-side
    only, tiny, well-worn) but the matrix is rendered to **our own inline SVG** so it stays
    crisp and on-palette (#46101c on white); if the CDN is unreachable the block simply
    hides and the link still works. Verified structurally, not just visually: 33×33 grid,
    all three finder patterns correct ring/gap/core, timing row alternating.
  - **`PAYMENTS_LIVE` constant deleted.** How fees are collected is now
    `tournaments.payment_method` — `organiser` (default) or `online` — so switching a club
    to card is a toggle in the admin, not a code edit and redeploy.
    `tournaments.payment_instructions` carries the bank details / "pay on the day" text.
  - **One checkout for all outstanding fees.** `create-entry-checkout` now takes
    `entryIds[]`, builds one Stripe session with a line item per event, and stamps the
    session id on every fee row; `entry-webhook` settles **by session** (guarded to
    `pending`/`failed` so a replayed event cannot revive a refund). A player with three
    events pays once. Amounts are still read only from the caller's own `entry_payments`
    rows — never from the request.
  - **New player-facing "Fees & payments" section** (replaces the pay button buried in
    each entry card): every fee listed with status, per-fee paid/refunded timestamps, a
    single outstanding total, one "Pay £27.00 by card" button, the refund policy, and —
    when the organiser collects fees — a "How to pay" box instead of a card button.
    Refunded rows are struck through, and `my_fees.still_in` means a fee for an entry the
    player was swapped out of reads "You are no longer in this entry" rather than showing
    the pair who replaced them.
  - **Stripe return handled**: `?paid=1` polls `my_fees` for up to ~7s (the webhook can
    land after the redirect) then confirms; `?paid=0` says nothing was charged and the
    place is still held. The param is stripped from the URL either way.
  - Verified: £27.00 across two events for one player; the 503 path shows "Card payment is
    not switched on… Pay the organiser directly for now" and leaves the button retryable;
    organiser mode hides the card button and shows the bank details; Nadia's swapped-out
    refund renders struck through with both timestamps.
- 2026-08-12: **passwordless sign-in (email OTP) is now the primary player path.**
  Rationale: a player signs in maybe twice a year, so a password is pure friction — and
  their email already IS their identity here, because it is how partners invite them.
  - **A typed 6-digit code, not a magic link.** A link opens in whatever browser the mail
    app chooses, which throws away a half-finished entry *and* the `?invite=` token in the
    URL. A code is typed into the tab they are already in, so the tournament, the
    invitation and any partially-filled event selections all survive.
  - Sign-in is now one path — no "sign in / create account" tabs, since the same code
    does both (`shouldCreateUser: true`). Password remains as a deliberate fallback
    ("I would rather use a password"), which is also what keeps the `@demo.invalid` demo
    logins usable.
  - UX details: the code field strips non-digits and caps at six; reaching the sixth digit
    **auto-submits**; "Send another" and "Use a different email"; rate-limit errors are
    reworded to "That is a lot of codes in a short time"; an expired/wrong code says so
    and points at Send another. When arriving from an invitation the email field is
    **pre-filled with the invited address**, so the code goes to the right mailbox.
  - **Two dashboard steps are outstanding and MUST be done for this to work in the real
    world** (neither is doable from here):
    1. Authentication → Email Templates → **Magic Link**: add `{{ .Token }}`. The stock
       template contains only `{{ .ConfirmationURL }}`, so today the email carries a link
       and no 6-digit code.
    2. **Custom SMTP** (Resend — the same account already wanted for partner invitations).
       Supabase's built-in mailer is capped at a couple of messages an hour, which is
       nowhere near a tournament opening its entries.
  - **Testing honesty:** the round trip could not be completed here. Supabase validates
    deliverability, so `@demo.invalid` and `@example.com` are both refused ("Email address
    … is invalid" — surfaced cleanly by the UI), and sending test mail to a domain we do
    not control would be wrong. Proven instead: the send call reaches GoTrue and its
    errors surface; the code panel renders with the target address; input sanitising and
    auto-submit at six digits; `verifyOtp` is called correctly and a bad code produces the
    friendly rejection; the password fallback still signs in. **Paul should do one live
    run with his own address once the template and SMTP are set.**
- 2026-08-12: **"pay on the day" removed everywhere** at Paul's request — entry fees are
  settled in advance, full stop. Changed: the admin's collection option now reads "I
  collect them in advance (bank transfer / cash before the day)"; its hint says fees must
  be settled to make the draw; the player page's fallback text dropped "or you can pay on
  the day" and gained "Entry fees must be settled before the draw is made — an unpaid
  entry is not placed in it"; the Winter Open demo instructions now say "Please pay within
  7 days of entering". **This only aligned the copy with what the engine already did** —
  `recalc_entry_status()` holds an entry at `incomplete` until every player's fee is
  settled, and draw generation only ever picks up `entered`, so an unpaid player was never
  going to be drawn. Note the phone field's "for the organiser on the day" and the whole
  day-of **check-in** flow are untouched: those are about the event, not payment.
- 2026-08-12: **player phone number — the field existed, but it was going nowhere**
  (`008_sync_player_phone`). Paul asked for an optional phone; the profile has had one all
  along (his own screenshot showed 07563021054 in it), so the useful work was finding out
  it never reached the organiser: neither `upsert_my_profile` nor `ensure_player` copied
  `player_accounts.phone` onto the tournament-scoped `players` row, and the admin's
  Players tab had no column for it anyway. So a player typed their number in and the
  organiser could never see it. Fixed all three:
  - both rpcs now write `players.phone` (and `ensure_player` sets it when first creating
    the row); existing rows backfilled;
  - admin Players tab gained a **Contact** column — email and phone as `mailto:`/`tel:`
    links, so it is one tap on a phone at the venue — plus an "online" pill marking
    players who entered themselves and therefore keep their own details current;
  - the organiser's own "Add player" form gained a phone field, so typed-in players are
    not second-class;
  - player-side hint reworded from "for the organiser on the day" to "so they can reach
    you about your entry, or on the day if a match time moves", with `autocomplete="tel"`.
  Verified end to end: saved 07700 900461 as Rachel on the entry page → it lands on both
  `player_accounts.phone` and `players.phone` for the Winter Open. The admin Contact
  column itself is unverified visually (behind Paul's login) — the data path is proven and
  the markup is a column render.
- 2026-08-12: **`site/display.html` — the TV / court-side screen** (locked decision 10).
  Different rules to the other surfaces: read at five metres, nobody touches it, and it
  must never produce a scrollbar — so every size is in `vh`/`vw` and one file fits a 1080p
  telly, a 4K panel or a laptop on the scorer's table.
  - **Panels rotate every 15s, data re-reads every 20s**, with a progress bar, dots, and a
    pulsing "live" beat. Built dynamically from what actually exists, so the same file
    covers an empty tournament, a live one and a finished one: **On court now** (one card
    per court, live game scores) → **Up next** (time · court · who, ordered time-then-court
    so a slot reads left-to-right across the hall) → **Latest results** → a **knockout
    bracket per event** → **pool standings per pool** → **Champions**.
  - "On court" is defined as *scheduled, both sides known, not yet decided* — deliberately
    NOT "scheduled_at <= now", because a running day is always late and a demo is always
    in the future. The same rule reads correctly in both.
  - Names are shortened to "S. Threlfall / A. Belfield" — full doubles pairs are unreadable
    at distance. Resolved through one tournament-wide map as always.
  - **QR in the footer** to the public results page, so spectators get full draws on their
    phone; reuses the encoder added for the admin.
  - Keyboard for demos: space pauses, ←/→ step panels, F fullscreens.
  - `?t=<slug>` picks the tournament (else it prefers one running today, then the next
    one). **`?court=3` locks the screen to a single court** — for a screen on one court.
  - Admin Setup gained a "📺 Court-side display" button next to the share link.
- 2026-08-12: **third demo tournament — "Cheltenham Spring Shootout"** (`cheltenham-spring-shootout`,
  tagged `Demo data`), deliberately **mid-play** because neither existing demo could show
  the two panels that matter most: Cotswold is finished, the Winter Open has no draws.
  Dated `current_date` with slots at `now() - 80 min` + 30-min rounds, so it always looks
  live whenever it is opened. 12 players, 2 events (Mixed Doubles 3.5, Women's Singles),
  4 courts, 12 matches: round 1 finished, round 2 **on court with part-scores**, round 3
  to come. Building it caught a real fault in my own demo data twice — first a player in
  two events at the same time, then a 4-entry round-robin whose slots paired overlapping
  matches (1v2 with 1v3). Correct pairing is (1v2, 3v4) (1v3, 2v4) (1v4, 2v3);
  `schedule_clashes` now reports **0**. Worth remembering: the demo must never display
  something the product exists to prevent.
- 2026-08-12: **clashes by overlap, running-late estimate, the board, and a player's own
  order of play** (`009_overlap_clashes_and_running_late`, `009b_my_schedule`).
  - **`schedule_clashes` now compares WINDOWS, not timestamps.** The old view only caught
    an identical `scheduled_at`, so 10:00 and 10:15 on one court passed. Each match now
    occupies `slot_minutes × (1 game if best_of = 1, else 2)` and two matches clash if the
    windows intersect. Proven by rollback test: a 15-min gap on one court is caught,
    genuinely adjacent slots stay clean, an overlapping player across two courts is
    caught, and a best-of-3 correctly occupies a longer window. **Do not tell customers it
    prevents double-booking outright — it now detects real overlaps, which is a much
    stronger claim than before, but the organiser can still save one deliberately (warn,
    never block).**
  - **`matches.completed_at`** stamped by trigger the first moment a winner is recorded
    (cleared if the result is cleared), so **`running_late_minutes()`** can average the
    last six finishes against their planned end. Zero extra work for the organiser, and it
    turns "approximate" from a hedge into a measured number. Averaging only recent
    finishes means it tracks a day that recovers, instead of being anchored by a slow
    first round.
  - **Order-of-play board** — new `board` panel on `display.html`: courts across, time
    down, like a departures board. Cells colour-coded done / in play (green, with the live
    score) / to come (gold), rows are the start times actually used so a ragged schedule
    still lines up, and only a ~6-slot window around the first undecided slot is shown
    (a whole day shrinks the type to nothing). `?view=board` pins the screen to it and
    stops the rotation — for a venue with one dedicated schedule screen.
  - **Player-facing "Your matches"** on `enter.html`, placed **first** because on the day
    it is the only thing they want: estimated time with the planned time beneath it, court
    (or "Court TBC" — stated, never guessed), the opponent, who they are playing with, the
    live score if it is on, and results underneath an "Already played" band. The delay
    banner explains itself: "be at your court early anyway, because a day can catch up as
    fast as it slips."
  - Demo: Spring Shootout back-dated `completed_at` so it reads **12 minutes behind**.
    New demo login `sam.threlfall@demo.invalid` (same password) is linked to a real player
    in that tournament, so the player-side schedule can be demoed live.
- 2026-08-12: **full-app stress test — 3 tournaments, 150+ players each, top to bottom**
  (`010_stress_test_fixes.sql`; full write-up in `docs/stress-test-report.md`). Ran
  Gloucester Grand Slam (158 players, 5 events, 374 matches, organiser-entered, 12-court
  cross-event scheduling → **0 clashes**), Avon Winter Open (160 real self-service
  accounts: mass registration, capacity→waitlist at exactly 32, partner swap after
  payment refunding only the dropped player, RPC-abuse + anon-REST boundary), and Severn
  Monster (174 players, best-of-3 pools = **1,449 games** to cross the 1000-row ceiling,
  plus XSS/injection/emoji names and winner-tamper attempts). **Three real defects found,
  all invisible at demo scale, all fixed and re-verified:**
  1. **Admin writes to entries/payments failed** (`42501`). `005g` revoked
     `recalc_entry_status` from the API roles, but the triggers that call it run as the
     invoking role — so a signed-in admin adding an entry or marking a fee paid rolled
     back. Fix: the two `_recalc` trigger wrappers are now `SECURITY DEFINER` (and revoked
     from every API role, so still unreachable as RPCs). Only surfaced when the admin UI
     was driven as a *real* signed-in admin — service-role seeding and player RPCs were
     immune, which is why it hid this long.
  2. **A drawn tournament/event couldn't be deleted.** The cascade to `entry_players`
     tripped `guard_entry_players_after_draw`, so the admin delete buttons failed on any
     tournament past the draw stage. Fix: `app.bypass_draw_guard` session flag +
     `admin_delete_tournament`/`admin_delete_event` SECURITY DEFINER wrappers (gate on
     `is_tournament_admin()`); the admin UI now calls these.
  3. **Silent 1000-row truncation on all three pages** — the worst kind (wrong data, no
     error). PostgREST caps at 1000 rows; a big best-of-3 event dropped ~450 games off the
     public page, board, and — dangerously — the admin score-entry map. Fix: a shared
     `fetchAllIn()` on each of index/display/admin that pages in 1000-row windows and
     chunks the id list (200/batch) so a huge `?in=(…)` can't overflow the URL. Every large
     read now uses it.
  Also revoked anon execute on the new definer functions (folded into `010`). **Held up
  with no changes:** pool standings (28 pools, 0 ordering violations), advancement through
  4 rounds, money integrity, check-in gate, XSS escaping, all RPC-abuse and anon-REST
  attempts refused. **Demo data proven byte-identical to a pre-test snapshot** (3/56/9/53/
  47/53/10/10/12/5 unchanged); all `@stress.invalid` accounts + temp admin + temp SQL
  helper removed. **Lesson for this codebase: any `.in()` read can silently truncate at
  1000 rows — always page. And a guard/revoke that's fine for service-role + SECURITY
  DEFINER RPCs can still break the plain signed-in-admin path; test as a real admin.**
- **Next:** Paul sets `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Edge Function
  secrets, points a Stripe webhook at `/functions/v1/entry-webhook`
  (`checkout.session.completed`, `charge.refunded`, `checkout.session.expired`) and
  flips `PAYMENTS_LIVE = true` in `enter.html` → enable leaked-password protection in
  Auth settings (advisor warning; players have passwords now) → partner-invitation
  emails via Resend (the invite link is `enter.html?invite=<token>`; nothing emails yet,
  invitations are only visible when the partner signs in) → walk the organiser flow on
  the Winter Open (auto-seed → draw → schedule → scores; exercise the deletes) →
  fuzzy CSV entry import (pattern in `Desktop/PBTable-Production/site/index.html`) →
  `site/display.html` (TV mode) → demo tournament (tagged `Demo data`, fictitious
  names) → Netlify.
