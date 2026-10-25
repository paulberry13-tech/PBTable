# Inter-County League — handoff for a fresh session

Written 2026-08-06 at the end of a long PBTable session. This is a **new, separate product**. It is
not a PBTable feature, and it must not be built inside PBTable's codebase or database.

Read this whole file before writing anything. Section 7 (Decisions still needed) is not optional —
four things are genuinely undecided and picking wrong will cost a rebuild.

---

## 1. What we're building

A league management tool for an **inter-county pickleball league**. Day-one job, in Paul's words:
**fixtures, results and league tables.** Team selection is secondary — captains just need to record
who actually played.

## 2. Domain model as understood

```
County            e.g. Wiltshire, Dorset          (the "club" equivalent)
  └─ Team         e.g. Wiltshire A, Wiltshire B   (a county fields MORE THAN ONE team)
       └─ Squad selection, PER SESSION            (max 8 players; composition varies each time)
Player            belongs to a county squad; carries a rating (see §4)
Division          contains teams; multiple divisions in a season
Season            one season to start, but model it so a second is not a migration
```

Two things to be careful of:

- **A team is a persistent entity, not a one-off selection.** "Wiltshire A" exists across the
  season; who plays for it changes each session. Model `team` and `team_selection` (or
  `fixture_squad`) separately.
- **Divisions almost certainly contain _teams_, not counties** — otherwise Wiltshire A and
  Wiltshire B can't sit in different divisions. Confirm (§7).

## 3. Fixture format — confirmed by Paul

A **team meeting** (one county team vs another) is **4 games**:

| # | Game        |
|---|-------------|
| 1 | Men's doubles   |
| 2 | Women's doubles |
| 3 | Mixed doubles   |
| 4 | Mixed doubles   |

A **session** (a day's play) typically has **4 teams in a group**, each playing each. So:

- each team plays 3 meetings × 4 games = **12 games per session**
- the group as a whole plays 6 meetings × 4 games = **24 games per session**

Consequences for the model:

- **Gender is structural, not decorative.** Men's/women's/mixed selection depends on it, so every
  player needs a gender and the selection UI must enforce it. Use the vocabulary PBTable settled on:
  `male` / `female` / `other` (full words — PBTable migrated off `M`/`F`/`O` on 2026-08-06 precisely
  because two formats in circulation caused live bugs).
- A player plays multiple games within one meeting, in different pairings. Results attach to a
  **game**, which belongs to a **meeting**, which belongs to a **session**.
- Max 8 players per team per session — a constraint worth enforcing in data, not just UI.

## 4. Ratings

Every player carries a rating. Three possible sources, and the **source must be stored alongside
the value** — a DUPR-derived 4.2 and a county-assessor's 4.2 are not the same claim:

1. **DUPR**, manually brought across
2. **County-assessed**, from knowledge of the player
3. **PBTable / other club rating**

Paul also wants counties to be able to opt into ratings **improving** off league results, so an
updated rating can carry into future seasons.

### ⚠️ There is a design problem hiding in that, and it needs resolving before building

Ratings in a head-to-head system are **relative**. If Wiltshire has "ratings improve" switched on
and Dorset has it off, then every Wiltshire–Dorset game updates one side and not the other. Dorset's
numbers go stale while still being used to compute Wiltshire's expectations. The league's ratings
stop meaning one thing.

Recommended resolution: **always compute centrally, make adoption optional.** The league calculates
a league rating for every player from every result. Each county then chooses whether to *adopt* that
figure as their players' carried-forward rating for next season, or to keep using their own source.
That gives Paul what he asked for without an asymmetric engine. Confirm in §7.

If ratings do get computed, **reuse PBTable's RDR engine rather than inventing one.** It is in
`Desktop/PBTable-Production/site/index.html` (`replayAllSessions`, plus `ratingK`, and the constants
`R_D`, `R_KMIN/KMAX/KHALF`, `R_ALPHA`, `WIN_FLOOR`). It handles expectation from team averages,
margin-of-victory damping, an asymmetric penalty for underperformance, and a maturity-based K. It is
also **explainable**, which matters — see §8.

## 5. Database: use a SEPARATE one

Paul's instinct was right and I'd back it firmly.

**Why separate:**

- The domains barely overlap. Counties/teams/divisions/fixtures versus clubs/sessions/RDR/bookings.
- PBTable's production database is shaped tightly around the club model: RLS policies keyed on
  `club_admins`, a booking layer, `private.is_club_admin()`. Every one of those becomes a thing to
  reason around.
- **Blast radius.** PBTable production runs two live clubs. A migration mistake in a league tool
  must not be able to touch them.
- Independent migration and backup cadence.

**The one real pull toward sharing** is player ratings — a player might exist in both. Solve that by
importing a rating **as a value with provenance** (`source`, `value`, `captured_on`), not a live
foreign key. If live sync is ever wanted, a read-only integration between two clean databases is far
easier than untangling two domains that grew together in one schema.

**Concrete warning from today:** PBTable has two players called "Steve Reynolds" — one at Swindon
rated 4.486, one at Melksham rated 3.8. A query that forgot the club filter silently returned the
wrong one and produced completely wrong analysis. In a league spanning many counties this class of
bug is far more likely. **Never key on player name. Use IDs, and scope every query by county.**

## 6. What to reuse from PBTable, and what not to

**Worth reusing (as reference, copied deliberately — not imported):**

- The RDR rating engine and its constants (§4)
- The fuzzy name-matching + explicit-review pattern for CSV imports
  (`fuzzyMatch`, `FuzzyMatchReview`) — any name that isn't an exact match forces a decision
- The single-file, no-build deploy model, if you want the same simplicity

**Do NOT reuse:**

- The `clubs` / `club_admins` / RLS shape — the league's permission model is different
  (league admin > county captain > player) and should be designed fresh
- The booking layer — irrelevant here
- The `PB_BACKENDS` host-switching trick, unless the league genuinely needs a demo instance

## 7. Decisions still needed before building

Each of these changes the schema. Get answers before the first migration.

1. **Do divisions contain teams or counties?** (Recommendation: teams, so a county can run A and B
   sides in different divisions.)
2. **How is a meeting won, and how are league points awarded?** Games won 3–1? Aggregate points
   difference? Bonus points? This determines the entire standings calculation and is the thing the
   league table exists to show. Currently unknown.
3. **The ratings-toggle question in §4** — confirm "compute centrally, adopt optionally".
4. **Player eligibility.** Can a player appear for more than one county, or more than one team
   within a county, across a season? Is there a cup-tying rule? This decides whether player→county
   is a simple FK or a registration table with effective dates.

Secondary, but ask early:
- Does a session always have exactly 4 teams, or is group size variable?
- Who records results — a central admin, or each county captain for their own meetings?
- Does the public need to see anything, or is this admin-only to start?

## 8. Things this session learned the hard way — apply them here

These cost real time on PBTable today. They generalise.

- **Give this product its own folder and its own `.mcp.json`.** Two sessions sharing a folder and a
  config silently flipped each other's database connection between demo and production, more than
  once. One folder, one product, one config.
- **Declaring an MCP server in `.mcp.json` is only half the job.** It must also be listed in
  `enabledMcpjsonServers` for that project in `~/.claude.json`, and the app must be fully restarted.
  A correctly-written config that was never enabled meant a session ran with *no database at all*
  while appearing to work.
- **Authorising a server via `/mcp` can silently disable the others.** Re-run `claude mcp list`
  afterwards and confirm every server reports `✔ Connected`.
- **Point the tool at a sandbox by default.** PBTable ended with `supabase` = demo (full access) and
  `supabase-prod` = production (`&read_only=true`, plus a deny-list on write tools and `git push`).
  Any un-thought-through call lands somewhere harmless.
- **Dashboard-run SQL does not register in the migration ledger.** `list_migrations` will under-report
  and claim applied migrations are missing. Verify schema with column-level checks, not the ledger.
- **A demo/sandbox with every feature switched on cannot test a feature being switched off.** Two
  separate bugs today were invisible on demo for exactly this reason. Test disabled states by
  temporarily flipping the setting, and put it back.
- **Explainability is a feature.** Paul needed to justify to a player why a 2–2 night cost more
  rating than a 1–3 night. Design the results model so a per-game "expected vs actual" breakdown can
  be shown from stored data, rather than reconstructed later.

## 9. Suggested first steps in the new session

1. Answer §7.1–7.4.
2. Sketch the schema on paper first: `counties`, `teams`, `players`, `seasons`, `divisions`,
   `division_teams`, `sessions`, `meetings`, `games`, `game_players`, `ratings`.
3. Create the Supabase project, its own folder config, and confirm the connection before any DDL.
4. First migration: counties, teams, players, ratings-with-provenance. Nothing about fixtures yet.
5. Only then model fixtures/meetings/games, once §7.2 (scoring) is settled.

---

**Contact point for context:** the PBTable session that produced this ran in
`Desktop/PBTable-Demo`. Its `CLAUDE.md` documents the club product's architecture, and
`Desktop/PBTable-Production` holds the code and migrations referenced above. Read them for the RDR
engine and the CSV-import patterns — but build this product separately.
