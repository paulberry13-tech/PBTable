# Inter-County League

League management for an inter-county pickleball league: **fixtures, results, league tables**.
Team selection is secondary — captains record who actually played.

This is a **separate product** from PBTable. Separate folder, separate Supabase project, separate
`.mcp.json`. It must never touch PBTable's database. Background and rationale: [HANDOFF.md](HANDOFF.md).

## Decisions — locked with Paul, 2026-08-08

All four blocking questions from HANDOFF §7 are answered, plus the secondary ones:

1. **Divisions contain teams**, not counties — Wiltshire A and Wiltshire B can sit in different
   divisions. Enforced: a team is in exactly one division per season.
2. **Meeting result:** won on games (out of 4). If games are 2–2, **aggregate points difference
   across the 4 games decides the winner**. Only a dead-level meeting (2–2 and points diff 0) is a
   draw.
3. **League table:** 1 point per meeting won; a dead-level draw scores 0.5 each (confirmed by
   Paul 2026-08-08). Tie-breakers: games won, then aggregate points difference.
4. **Ratings:** compute centrally, adopt optionally. The league computes a rating for every player
   from every result; each county chooses whether to adopt it as the carried-forward rating.
   Reuse PBTable's RDR engine as reference (see below) — do not invent a new one.
5. **Eligibility:** a player registers with one county per season and may play for any of that
   county's teams, session by session. Simple `players.county_id` FK — no registration table yet.
6. **Group size is variable** — usually 4 teams per session, but 3 or 5 must work.
7. **Results are entered by the league admin only** (captains may come later).
8. **Public read-only** league tables, fixtures and results at launch; writes behind admin login.

## Schema (migrations in `supabase/migrations/`)

```
counties ─< teams ─< division_teams >─ divisions ─< seasons
counties ─< players ─< player_ratings (source + value + captured_on — provenance always)
divisions ─< sessions ─< session_teams ─< squad_players (max 8, county-checked)
sessions ─< meetings ─< games (slot 1 mens, 2 womens, 3+4 mixed) ─< game_players
views: player_current_ratings, meeting_results, standings
```

- `001_core.sql` — counties, teams, players, ratings-with-provenance
- `002_competition.sql` — seasons, divisions, sessions, squads, meetings, games + integrity triggers
- `003_standings_and_access.sql` — result/standings views, `league_admins`, RLS (public read, admin write)
- `004_harden_function_search_path.sql` — pins `search_path = ''` on the two trigger functions
  (logic unchanged from 002; clears the Supabase security linter)

Gender is structural (`male`/`female`/`other`, full words — never `M`/`F`/`O`). DB triggers block
unambiguous violations (a female player in men's doubles); players with gender `other` are allowed
anywhere at DB level — policy for them is a UI/league decision.

## Hard rules (learned expensively on PBTable — HANDOFF §8)

- **Never key on player name.** Two "Steve Reynolds" exist in PBTable. IDs only; scope queries by county.
- **Verify schema with column-level checks, not the migration ledger** — dashboard-run SQL doesn't register in it.
- After any `/mcp` auth change, run `claude mcp list` and confirm every server is `✔ Connected`.
- Explainability is a feature: store enough per game (scores, pairings) that "expected vs actual"
  rating breakdowns can be shown from data, not reconstructed.

## References

- RDR engine: `Desktop/PBTable-Production/site/index.html` — `replayAllSessions`, `ratingK`,
  constants `R_D`, `R_KMIN/KMAX/KHALF`, `R_ALPHA`, `WIN_FLOOR`. Copy deliberately; don't import.
- CSV import pattern worth copying: `fuzzyMatch` + `FuzzyMatchReview` (non-exact names force a decision).
- Do **not** copy PBTable's `clubs`/`club_admins` RLS shape or its booking layer.

## Supabase project

- Name: **Inter-County League**, in the existing paulberry13-tech org (created 2026-08-08)
- Ref: `hhstodmbvuaceswtbkym` — URL `https://hhstodmbvuaceswtbkym.supabase.co`
- Publishable (client/anon) key: `sb_publishable_cGmfFEfm94o7l1BNjTqc5w_Pec22W8B`
  (safe to embed in the public site; RLS does the protecting)
- MCP server name for this folder: `supabase-league` (see `.mcp.json`)

## Status

- 2026-08-08: decisions locked, schema drafted, migrations written. Supabase project created,
  `supabase-league` MCP connected.
- 2026-08-08: **migrations 001–004 applied and verified.** 14 tables + 3 views live; RLS on every
  table (`public read` select + `admin write` all); both integrity triggers enforcing. Verified by
  column-level checks against `information_schema`/`pg_policy`, not the migration ledger.
- Smoke-tested end to end inside a self-rolling-back block (DB left at zero rows in every table):
  a 2–2 meeting decided on aggregate points difference resolves to the right winner and the
  `standings` view awards 1 league point to them, 0 to the loser. All six integrity rules reject
  bad writes — wrong-county squad pick, player not in the squad, female in men's doubles, two men
  in mixed, a 9th squad player, a 3rd player on a side. The last two hold even when smuggled in as
  a single multi-row `INSERT`, so the row triggers do see their statement-siblings.
- Security linter: clean apart from two accepted warnings about `is_league_admin()` being a
  `SECURITY DEFINER` function callable via RPC. Left as-is deliberately — see the note at the
  foot of `004`. It reveals only whether the caller themselves is an admin.

- 2026-08-08: first league admin bootstrapped — `paul@pbtable.co.uk`
  (`cce8ba8b-3cad-4ba6-9082-0bf9d6627dda`) in `league_admins`, `is_league_admin()` verified true.
  Dead-level draw = 0.5 points each confirmed by Paul.

- 2026-08-08: league seeded — counties Gloucestershire / Oxfordshire / Wiltshire, two teams each
  (A + B); season **26/27 Season** (placeholder dates Sep 2026–Aug 2027, rename is a one-row
  update); divisions: Division 1 = A teams, Division 2 = B teams, Division 3 empty for growth.

- 2026-08-08: public site first cut built — `site/index.html`, single-file no-build (PBTable's
  deploy model). PBTable look-and-feel with a distinct racing-green + gold palette; Barlow /
  Barlow Condensed. Division tabs, standings (merges `division_teams` entrants with the
  `standings` view so 0-played teams show), sessions/fixtures with expandable game-by-game
  detail incl. 2–2-on-points-difference and dead-level notes. Reads live via supabase-js CDN +
  publishable key. Verified in browser against live DB: tabs, table, empty states all render.

- 2026-08-08 (later): demo league built out per Paul. 27 fictitious teams (9 per county, 3 per
  county per division), 108 demo players (4 per team: 2 male + 2 female) with county-assessed
  ratings and a soft `default_team_id` (005), one completed Division 1 demo session (4 teams,
  6 meetings, 24 games) exercising every trigger. Site v3: palette changed to deep
  indigo-violet + teal (Paul rejected green/gold; navy/coral is PBTable's), added **Players**
  section (search/filters, per-player expandable: stat tiles, by-game-type record, pairing
  records, game log — all computed client-side from `games`+`game_players`) and **Bookings**
  section (3-step availability framework explainer + upcoming-sessions list; writes arrive with
  player auth). Migration `005_booking_framework.sql` adds `players.default_team_id`
  (county-checked trigger) and `session_availability` (RLS: public read, admin write).
- All demo rows are marked (`notes='Demo data'` on the session, ratings notes) — teams/players
  are fictitious and replaceable when real entries arrive.

- 2026-08-08 (later still): **admin area built** — `site/admin.html`, single-file, Supabase email
  auth + `is_league_admin()` RPC gate (non-admins are signed straight back out). Three screens:
  sessions list (scores-in count per session), new-session wizard (division → date/venue → team
  chips → per-team squad pickers pre-ticked from `default_team_id`, 4–8 players enforced client-side;
  creates session + session_teams + squad_players + all meetings + all empty game rows in one go),
  and score entry (pairings pre-filled by convention — M1+M2 men's, F1+F2 women's, M1+F1 / M2+F2
  mixed; keyboard flow home-score ⏎ away-score ⏎ = save + jump to next game; per-game save dots,
  session progress bar, meeting headers live-update with 2–2/points-difference notes; save =
  delete+reinsert `game_players` then update scores, so re-saves overwrite cleanly; DB triggers are
  the integrity backstop and their errors surface on the row). "Mark completed" unlocks at 24/24.
  Not yet built: session delete/edit-structure, captains, availability writes.
- Local review server: `.claude/launch.json` → `npx http-server site -p 8177` (8123 was taken).
  Public site http://localhost:8177 · admin http://localhost:8177/admin.html
- 2026-08-08 (evening): admin polish per Paul — "Save all entered" bulk-flush + beforeunload guard
  on score entry, editable session date/venue, Admin link in public nav, always-visible
  "← Public site" link in admin header. Demo data round 2, generated set-based in SQL (squads via
  `default_team_id`, conventional pairings via row_number over gender, random scores): five more
  completed sessions — Div 1 ×1 more, Div 2 ×2, Div 3 ×2 (one a 3-team group, proving variable
  group size). League now: 33 completed meetings (30 on games, 3 on 2–2 points difference), every
  division with populated standings. Paul's own 9-team 0/144 test session (29 Aug, Oxstalls) kept
  deliberately as score-entry practice.

- 2026-08-08 (late): fixtures section rebuilt for scale — sessions are now collapsed `<details>`
  cards (summary: date · time · venue, meetings count, `n/m games in`, pill Pending / Part scored /
  Results in), plus a **team filter** that narrows to one team's sessions and meetings and shows a
  per-team summary card (next-up line, date/venue/opponent/result table, W–L record). "Pending" is
  the empty-state word throughout (unplayed session, team with no sessions, division with none).
  Meeting pairings are **lazy-loaded on expand** — the initial query no longer pulls `game_players`,
  which matters with the 144-game session in Div 1. `006_session_start_time.sql` adds nullable
  `sessions.start_time` (admin wizard + edit form set it; public shows date · time, date alone when
  null). Demo sessions set to 10:00; Paul's 29 Aug session left timeless to exercise that path.

- 2026-08-08 (late): Players section now has a **Players / Pairings** segmented toggle — Paul
  rightly pointed out the heading promised pairing performance but the table was individual-only
  (pairings were buried in the per-player expand). Pairings view = one row per partnership
  (names + format, team, played, W–L, win rate, points diff), sorted played → win rate → diff,
  sharing the same search/county/team filters. Built client-side from `game_players` grouped by
  game+side; team comes from the meeting's home/away team, not `default_team_id`, so it reflects
  who they actually played for.

- 2026-08-08: PBTable logo added top-left of both public and admin headers (+ favicon);
  `site/pbtable-logo.png` copied from `pbtable-site/`.
- 2026-08-08: **court availability, light version** (`007_session_courts.sql` — nullable
  `sessions.courts`). Planning aid only; no results logic touches it. The capacity model, used by
  `sessionShape()` in admin.html: a meeting is 4 games but only **2 run concurrently** (each player
  plays 2 of the 4 — M1+M2 men's, F1+F2 women's, M1+F1 / M2+F2 mixed), and at most
  `floor(teams/2)` meetings run at once, so usable courts = `2 * floor(teams/2)` and duration ≈
  `ceil(games / usable) * 20 min`. The wizard shows this live while picking teams and turns the
  line red past 6 hours; extra courts beyond usable are called out as wasted. Public session cards
  show "venue · N courts". Deliberately **not** built: a court-by-court round scheduler, and a
  `venues` table (venue stays free text until venues need managing for their own sake).
  Reference numbers: 4 teams/4 courts ≈ 2h; 4 teams/2 courts ≈ 4h; Paul's 9-team session = 144
  games ≈ 12h on 4 courts, 6h on 8.
  Field is named **"Courts booked"** (not bare "Courts") with a hint spelling out that it only
  drives the time estimate and never affects selection/results — Paul pulled me up on shipping an
  unexplained input. Same label + hint on the score-entry edit form, whose inputs are now labelled
  rather than placeholder-only. General rule for this project: any admin input needs a name that
  says what it *is* and a line saying what it's *for*.

- 2026-08-10: **promotion/relegation ladder + playoffs** (`008_promotion_and_playoffs.sql`).
  - **Ladder model, locked with Paul:** movement happens after every *session*, not at season end —
    a session is a box. Top team in the session goes up a division, bottom goes down; the top
    division has nowhere up, the bottom nowhere down. `division_teams.position` is the admin's
    display order — promoted teams enter at position **4**, relegated at position **1**
    (`PROMOTED_ENTERS_AT` / `RELEGATED_ENTERS_AT` in admin.html). Position is presentation only:
    nothing in results, standings or selection reads it.
  - **Admin-applied, never automatic.** Score entry grows a "Promotion & relegation" card once all
    games are in: shows the session's finishing order (same tie-breaks as the league table, but
    from this session's meetings alone), previews the moves, applies on click. `division_movements`
    is the audit trail and also the "already applied" guard — one application per session.
  - **Playoffs = a session flagged `session_kind='playoff'`** with a free-text `stage`. Reuses the
    entire scoring path; excluded from `standings` (the view filters `session_kind='league'`) and
    never triggers promotion/relegation. Teams may be drawn from any division — `division_id`
    records the host. Recommended default format is a champions' finals day (round-robin among
    qualifiers), not a knockout: it fits the existing session model exactly. A true bracket with
    progression is **not** built.
  - `meeting_results` and `standings` were dropped and recreated to carry/filter `session_kind`.
  - Public site: playoff pill on session cards; "↑ promoted in" / "↓ relegated in" badges in the
    table. A division table lists **current members only** — an earlier version also showed departed
    teams greyed with "→ Division X" and Paul had it removed as noise; the arrival badges carry the
    story. Departed teams' results still exist in the `standings` view (attached to the division
    they were played in), they're simply not rendered in the old division.
  - Verified by self-rolling-back blocks: a scored playoff meeting leaves `standings` byte-identical
    (33.0 pts / 23 rows before and after), and a promote+relegate pair keeps division counts at 9/9
    with no team in two divisions.

- 2026-08-10: **league resized to 4 teams per division** per Paul (was 9). Kept, per division, the
  four teams that had played a complete round-robin together, so every retained team keeps a real
  3-meeting record: Div 1 = Oxford City Slammers / Salisbury Spires / Cheltenham Chargers /
  Swindon Strikers; Div 2 = Devizes Dinkmasters / Stroud Valley Smashers / Trowbridge Trojans /
  Witney Wolves; Div 3 = Warminster Warriors / Melksham Meteors / Kidlington Kestrels /
  Forest of Dean Foxes. Removed 15 teams + their 60 players, and the three sessions built around
  them (incl. the 3-team variable-size demo — that path is still supported, just no longer
  demonstrated in the data). Paul's 29 Aug practice session was **trimmed rather than deleted**
  (9 teams/36 meetings → 4 teams/6 meetings, still 0 scored) so score-entry practice survives.
  Now: 12 teams, 48 players, 4 sessions, 24 meetings, 96 games (72 scored). Zero orphan players
  or broken references after the cull.

- 2026-08-10: **county shown throughout** (Paul asked where a team's county appears). It was only
  in the standings sub-line and the Players table; now also on both sides of every meeting row, in
  the fixtures team filter, the per-team summary card, the pairings table, admin team chips and
  admin meeting headers.
  - Fixed a real bug found on the way: the fixtures team-name map was built from the division's
    **current** `division_teams`, so a team promoted or relegated away rendered as **"TBC"** in its
    own past fixtures. Team names/counties now come from a single league-wide `teamMeta` map loaded
    once in `boot()` (`teamOf(id)`); the fixtures team filter is built from the union of current
    entrants and every team appearing in that division's sessions. **Rule for this codebase: never
    resolve a team name from a division-scoped list — divisions change mid-season.**

- 2026-08-10: **playoffs surfaced on the public site** — deliberately a section, not a separate
  page (single-file no-build site; a second page would duplicate boot/styles/Supabase wiring for a
  handful of rows). Two pieces:
  - **Champions strip** in the hero, right of the division tabs: one gold chip per division whose
    playoff is complete ("Division 1 champions — Cheltenham Chargers"), linking to the section.
  - **Playoffs section** (nav link between Fixtures and Players): a card per playoff with stage
    name, division pill, date/venue/courts, a completion pill, a gold champions banner, a
    round-robin mini-table (same tie-breaks as the league) and the expandable meetings.
  - Playoff sessions are now **excluded from the division Fixtures list** (`.eq('session_kind',
    'league')`) so they appear in exactly one place — this also keeps the fixtures team-summary
    W–L purely league form.
  - `wireMeetings()` gained a `data-wired` guard now that two sections render meeting rows.
- 2026-08-10: **`.meetings-head` band** added wherever a table runs into meeting scores — Paul
  flagged that standings flowed straight into the scores with nothing to mark the change. Session
  cards get "Meeting results"; playoff cards get "Final standings" (or "Standings so far") above the
  mini-table *and* "Meeting results" above the meetings. Both carry a one-line explainer that the
  score is games won out of 4. Also: `--cream` and `--mid` are close enough that two adjacent
  sections read as one page, so section backgrounds now strictly alternate
  (table/playoffs/bookings cream, fixtures/players mid) with a hairline top border on each.

- 2026-08-10: **league settings** (`009_league_settings.sql`) — a per-season `league_settings` row
  (public read, admin write) plus a **⚙ League settings** screen in the admin, reached from the
  sessions header. Five switches, deliberately few:
  - `ratings_enabled` — governs the not-yet-built ratings engine; the UI says so plainly rather than
    pretending it does something today.
  - `ratings_public` — hides the Rating column from the public Players table. **Verified working.**
  - `player_stats_public` — removes the whole Players/Pairings section *and* its nav link.
    **Verified working**, with the rest of the site unaffected.
  - `promotion_mode` (`per_session` | `off`) — `off` hides the promotion card from score entry;
    movements already applied are never undone. **End-of-season movement is NOT built** — it needs a
    season-close flow, so the enum has only the two honest values.
  - `max_squad_size` (4–16) — drives the wizard label, its live counter and its validation, and is
    enforced by the DB: `enforce_squad_rules()` now reads the setting instead of hardcoding 8.
    Verified by rollback test — a 5th squad player is accepted at cap 8 and rejected at cap 4.
  - Deliberately **not** configurable: the match format (slot/gender triggers) and the
    2–2-points-difference rule (lives in four places that would have to stay in sync).
  - `ratings_enabled` defaults to **false** on purpose — PBTable's lesson was that a demo with every
    feature on cannot test a feature being off.

- 2026-10-14: **Twoclear branding replaces PBTable** on both surfaces, per Paul. Assets copied from
  `Marketing/Twoclear Logos/twoclear-brand/` into `site/`:
  - Header (both pages, dark bar): `twoclear-icon-dark.svg` — the square badge, a straight swap for
    the PBTable paddle so "Inter-County League" still reads beside it. 40px public, 34px admin.
  - Public footer: `twoclear-full-dark.svg` — the full lockup *with* tagline, linked to twoclear.com.
    It replaced the repeated "Inter-County League" wordmark, which was redundant with the header.
  - Favicon: `twoclear-favicon.svg` + `twoclear-favicon-180.png` (apple-touch-icon).
  - **Variant naming is counter-intuitive — read it carefully:** `-light` = navy badge, *for light
    backgrounds*; `-dark` = white badge, *for dark backgrounds*. Our bars are dark, so `-dark` is
    correct. Same for the tagline colour (#667085 light bg / #D0D5DD dark bg).
  - Brand rules (from `Twoclear Brand Sheet.dc.html`): Navy **#101828**, Orange **#F97316**;
    clear space 0.5x badge height; min sizes full lockup 32px, compact 20px, badge 16px.
  - `site/pbtable-logo.png` left in place but unreferenced — delete once the change is signed off.
  - **Open question: the site palette is still indigo-violet + teal, not Twoclear navy + orange.**
    See the note under Status.

**Next: deploy to Netlify** (public + admin are both static files), then player auth to activate
availability bookings, then RDR ratings computation from results.
