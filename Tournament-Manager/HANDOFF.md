# Tournament Manager — handoff for a fresh session

Written 2026-08-10 at the end of the Inter-County League build. This is a **new, separate
product**: software to help organisers run pickleball **tournaments** (one-off or weekend
events), as distinct from PBTable (club nights) and the Inter-County League (season-long
team league). It must not be built inside either of their codebases or databases.

Read this whole file before writing anything. Section 6 (Decisions needed) is not optional —
the league build proved that settling those questions first is why it went fast; every one of
them changes the schema.

---

## 1. What we're building

A tool for a tournament organiser to: take entries, build draws, schedule matches onto courts
and time slots, record scores fast on the day, and publish live draws/results to players and
spectators. Day-one job, by analogy with the league's "fixtures, results, league tables":
**entries, draws, live scores.**

The customer is the **organiser** (the league product's admin-first model carried over):
public read-only pages for everyone, writes behind organiser login. Player self-service
(entering online, paying) is a likely phase 2 — model for it, don't build it first.

## 2. Context: the product family

Three products, three databases, one design language:

| Product | Unit of play | Cadence | Status |
|---|---|---|---|
| PBTable | club session | weekly, ongoing | live (prod: `Desktop/PBTable-Production`) |
| Inter-County League | team meeting (4 games) | monthly session, 3–4 month season | demo-complete (`Documents/PBTable/InterCounty-League`) |
| **Tournament Manager** | match in a bracket/pool | one-off event | this handoff |

Shared look-and-feel (Barlow / Barlow Condensed, dark hero + light sections, PBTable logo)
but **each product gets its own accent palette**. Taken: navy+coral (PBTable),
indigo-violet+teal (league), racing-green+gold (rejected by Paul for the league — do not
reuse without asking). Ask Paul for the tournament direction before styling.

## 3. What tournaments need that the league deliberately does NOT have

These were consciously excluded from the league build and are the core of this one:

1. **True knockout brackets with progression** — winner of match 7 advances to match 12.
   The league's "playoff" is just a flagged round-robin session. Tournaments need real
   bracket structures: seeding, byes, rounds, and (commonly in pickleball) **consolation /
   back draws** — double elimination is the US-tournament standard (see Pickleball
   Brackets / PickleballTournaments.com for the pattern). Model matches with
   `winner_advances_to` / `loser_advances_to` self-references from day one; retrofitting
   progression is a rebuild.
2. **Pools → knockout**: round-robin groups feeding a seeded bracket is the most common
   club-tournament format. The league's standings math (see §5) is reusable for pools.
3. **Court/time scheduling as a first-class feature.** In the league, courts are a planning
   hint. In a tournament, assigning matches to courts and time slots, avoiding a player
   being on two courts at once (players enter multiple events!), and keeping the day moving
   is half the product's value.
4. **Events within a tournament**: men's/women's/mixed doubles (maybe singles), usually
   split by skill band (e.g. 3.0–3.5, 4.0+) and/or age group. One player often enters 2–3
   events — the cross-event schedule clash is THE hard problem organisers have.
5. **Entries and check-in**: an entry is (player|pair) × event. Partner pairing, waitlists,
   withdrawal, no-shows on the day.
6. **Configurable match scoring**: best-of-3 games to 11 win-by-2 is common, but single
   game to 15 or 21 is used for early rounds to save time. Per-event setting, not global.
   (League hardcoded one format — right for a league, wrong here.)

## 4. Hard rules — learned expensively, apply from day one

Infrastructure:
- **Own folder, own Supabase project, own `.mcp.json`** (server name suggestion:
  `supabase-tournaments`). Never touch PBTable's or the league's DB. Blast radius is the
  reason; the league setup doc is `InterCounty-League/SETUP.md` — copy its steps verbatim
  (create project → project ref into `.mcp.json` → add to `enabledMcpjsonServers` in
  `~/.claude.json` → full restart → one-time interactive `claude` approval + `/mcp` OAuth →
  `claude mcp list` shows ✔ Connected — and check the OTHER servers still show ✔).
- **Verify schema with column-level checks against `information_schema`, never the
  migration ledger** (dashboard-run SQL doesn't register in it).
- **Smoke-test with self-rolling-back `DO` blocks** that end in `raise exception 'TEST -> %'`
  — proves triggers/views against real writes and leaves zero rows behind. This caught real
  bugs in the league build.

Data modelling:
- **Never key on player name.** Two "Steve Reynolds" exist in PBTable. IDs only; scope
  queries by club/county/tournament.
- **Gender is structural**: `male`/`female`/`other`, full words, never M/F/O (a two-format
  split caused live PBTable bugs). DB triggers block unambiguous violations (male pair in
  mixed); players with `other` pass at DB level — policy is a UI decision.
- **Ratings always carry provenance**: source + value + captured_on. A DUPR 4.0 and a
  self-assessed 4.0 are different claims — and seeding will run off these numbers, so it
  matters even more here.
- **Store enough to explain**: who played, per-game scores, pairings. "Expected vs actual"
  must be answerable from data, not reconstructed.
- **Never resolve a name from a stage-scoped list.** League bug: team names looked up from
  the division's *current* members rendered "TBC" for a relegated team's own past fixtures.
  One tournament-wide lookup map, loaded once.

Database patterns that worked (copy the shape from `InterCounty-League/supabase/migrations/`):
- RLS everywhere: `public read` (select using true) + `admin write` (all using
  `is_admin()`-style SECURITY DEFINER function, `search_path = ''` pinned). Bootstrap the
  first admin by dashboard insert; policies must prevent self-appointment. Accept the two
  Supabase linter warnings about the definer function (documented at foot of league 004/003).
- Pin `search_path = ''` on ALL functions and schema-qualify (`public.`) inside.
- Views with `security_invoker = on`; computed results live in views so scoring rules are
  one-place-changeable.
- Integrity triggers as backstop for what the UI enforces (squad caps, gender rules, "player
  must be checked in", two per side). Row triggers DO see statement-siblings in a multi-row
  insert — tested.
- Settings: a small per-tournament settings row, **few toggles, defaults chosen so the OFF
  path gets exercised** (a demo with everything on can't test anything off).

## 5. What to reuse from the league build (as reference — copy deliberately, don't import)

- **Fast score entry** — the design brief was "lots of scores in a short space of time" and
  the answer that worked: create every match/game row up front so score day is pure fill-in;
  prefill everything predictable; keyboard flow (score ⏎ score ⏎ = save + jump to next);
  per-row save with grey/amber/green/red dots; "Save all entered" bulk flush;
  `beforeunload` guard; DB errors surfaced on the row. Tournaments add one thing: the next
  match may not exist until this one's winner is known — saving a final score should
  advance the winner into their next bracket slot.
- **Standings math for pools**: meeting/match won on games; tie-breaks games-won then
  points-difference; the league resolves 2–2 on points difference (league-specific rule —
  ASK what tournament pools use, don't assume).
- **Deploy model**: single-file no-build HTML per surface (`index.html` public,
  `admin.html` organiser), supabase-js from CDN, publishable key embedded (RLS protects),
  sections + nav links not extra pages, Netlify-ready. `.claude/launch.json` →
  `npx http-server site -p <port> -c-1` for local review.
- **Admin UI conventions**: every input has a label saying what it IS and a hint saying
  what it's FOR (Paul enforces this); add `time`/`number` to the styled-input CSS selector
  from the start (they were missed once and looked broken); wizard shows live consequences
  of choices (the court/duration estimate line, red past 6 hours); edit-in-place for
  headline details; "Pending" as the empty-state word everywhere.
- **Court capacity math** (adapt): in doubles with a 4-game team meeting only 2 games run
  concurrently; for tournaments the equivalent constraint is a *player* can only be on one
  court, across all events. ~20 min per game held up as an estimate.
- **Demo data**: seed set-based in SQL (row_number over gender for pairings, random scores
  in a lateral), always tagged (`notes='Demo data'`), fictitious names. A rich demo was
  decisive with Paul's client conversations.
- **Fuzzy CSV import** pattern for entries: `fuzzyMatch` + `FuzzyMatchReview` in
  `Desktop/PBTable-Production/site/index.html` — non-exact names force a human decision.
- **RDR engine** (if tournament ratings ever wanted): same file, `replayAllSessions`,
  `ratingK`, constants `R_D`, `R_KMIN/KMAX/KHALF`, `R_ALPHA`, `WIN_FLOOR`.

Do NOT reuse: PBTable's `clubs`/`club_admins` RLS shape, its booking layer, or the league's
promotion/relegation ladder (meaningless in a one-off event).

## 6. Decisions needed before building (the schema-changers)

Ask Paul these before the first migration — one AskUserQuestion round, like the league:

1. **Entry unit & events.** Doubles only or singles too? Skill/age banding? Can one player
   enter multiple events (assume yes — then scheduling must prevent clashes)?
2. **Formats to support at launch.** Pools→knockout? Straight single elimination? Double
   elimination / back draw? Round-robin only ("box" days)? Recommendation: pools→single-elim
   knockout first (covers most UK club tournaments, reuses pool math), model the bracket so
   double-elim is an addition not a rebuild.
3. **Seeding.** By rating (which source wins?), organiser-ordered, or random? Provenance
   rule from §4 applies.
4. **Match scoring config.** Best-of-3 to 11 vs single game; per event? per round? Does the
   final differ?
5. **Entries.** Organiser-entered at launch (league model) or player self-service with
   payment? If payment: entry fees are per-event, Stripe exists in PBTable as reference —
   but that drags in refunds/waitlists; recommend organiser-entered v1.
6. **Scheduling depth.** v1 = assign matches to court+slot manually with clash warnings, or
   auto-scheduler? Recommend manual-with-warnings first; the auto-scheduler is a product in
   itself.
7. **Same Supabase org?** (paulberry13-tech worked fine for the league; free-tier cap is 2
   active projects per free org — check whether a slot is free or this needs the org's paid
   plan / a new org.)

Secondary: is there a tournament *series* concept (rankings across events)? Check-in flow on
the day? TV/court-side display mode for live draws?

## 7. Business context (from the league conversations — for continuity, not to rebuild)

- Paul sells to organisers; demo-first ("prototype built to check my understanding — tell me
  where the rules are wrong"), price the outcome not the effort, never volunteer the build
  timeline, add value rather than discount.
- League pricing landed at £35/team/season framing. Tournaments likely price **per event**
  (flat fee or per-entry) — organisers charge entrants £10–15/event, so a per-entry cut or
  a £50–100 flat per-tournament fee are the natural shapes. Decide with Paul when a client
  is real; don't build billing yet.
- A polished fictitious demo tournament (like the league's demo divisions) is the sales
  asset. Build it early.

## 8. Suggested first steps

1. Ask §6.1–6.7 (one question round). Lock decisions in the new folder's CLAUDE.md exactly
   like `InterCounty-League/CLAUDE.md` does — that file's decision-log + status-log format
   is the reason session handoffs worked; keep it updated every working block.
2. Sketch schema: `tournaments`, `events`, `players`, `player_ratings` (provenance),
   `entries` (player|pair × event), `pools`, `pool_teams`, `matches` (with
   `winner_advances_to`/`loser_advances_to`, court, scheduled_at, round, bracket kind),
   `games`, `game_players`, `tournament_admins`, settings row. Views for pool standings and
   bracket state.
3. Supabase project + MCP per §4 infra steps; verify connection before any DDL.
4. Migration 1: players/ratings/tournaments/events/admins + RLS. Then entries. Then
   pools/matches/games once §6.2 (formats) is locked.
5. Public site + organiser admin as single files; score entry gets the league's keyboard
   flow + winner-advancement; then the demo tournament.

---

**Contact points:** `InterCounty-League/CLAUDE.md` (decision log, migration list, every
lesson dated), `InterCounty-League/SETUP.md` (infra checklist), league migrations 001–009
(schema patterns), `Desktop/PBTable-Production/site/index.html` (RDR engine, fuzzy import).
Read them for reference — but build this product separately.
