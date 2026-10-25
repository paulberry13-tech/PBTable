# Prompt — Padel box league for Hurlands

Paste everything below the line into a new chat, started in this folder.

---

I want to build a **box league product for a padel club**. Read this whole brief before
proposing anything, then come back with a plan and the questions you actually need answered.

## The club and what they asked for

- One venue: **Hurlands**. Single club, single site. (Build it multi-tenant anyway — see below.)
- A **box league**: players are grouped into boxes of 4–6 by level, everyone plays everyone in
  their box over a round, top of each box goes up, bottom goes down, boxes reshuffle, repeat.
- **Matches are self-scheduled.** Players arrange their own games at Hurlands whenever both
  sides are free. There is no fixed match night and no single match day — this is the main
  structural difference from the league app I already have.
- **Players enter scores on their phones**, for **review by league admins**.
- **No live TV screen.** Do not build one.
- **No court booking.** Courts are booked outside the app; the app never touches availability.
- **A rating algorithm is wanted** — I want to consider it properly, not bolt on an Elo and hope.

## Start from the code I already have

There is a working league product at:

`C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\County Leagues\Gloucester`

It is the Gloucestershire Pickleball League (GPL): React 18 + TypeScript + Vite 6 + Tailwind v4
+ react-router 7 + Supabase (Postgres, RLS, edge functions, pg_cron), Vitest. It runs against a
**local** Supabase stack via Docker. Read it before you write anything — especially
`supabase/migrations/`, `src/lib/` (`derive`, `schedule`, `matchday`, `standings`, `scoring`,
`report`, `dupr`), `src/components/ui.tsx`, and `src/pages/admin/`.

**Mirror only what suits a padel box league.** This is a separate product in a separate folder
with its own Supabase project — it must never touch GPL's database.

### Take these (they are the good parts)

1. **Round → group → ladder.** GPL splits a ladder into groups each round, plays a round robin,
   then applies promotion and relegation and redraws. A box league is exactly this, so the model
   transfers almost unchanged. Keep the detail that relegated entrants join at the *top* of the
   box below and promoted at the *bottom*, and that ladder position is presentation only.
2. **Submit → confirm → dispute, with an audit log.** GPL already has players submitting scores,
   the other side confirming, a disputed state, an admin override (`official_result`) that records
   what it changed, and a `players_can_score` setting. This is precisely the "players score,
   admins review" flow the club asked for. Reuse the state machine and the audit table.
3. **The chase engine.** GPL has `run_chases` / `chase_once` / `send_digest` on pg_cron with a
   `chase_log` unique index so nobody gets nudged twice for the same thing. **This matters more
   in a box league than anywhere else** — the known failure mode of box leagues is matches that
   never get played. Nudge on: no match arranged yet, arranged but not played, played but not
   confirmed, deadline approaching.
4. **Settings-driven rules.** GPL reads points per game, tie-breakers, promote/relegate counts
   and squad caps from a season row rather than hardcoding them, and the public page explains the
   rules from those same values. Keep that; padel clubs will all want slightly different boxes.
5. **Void a game, and apply a score to an unfinished one** (retired / walkover / forfeit), with
   the reason stored and excluded from standings.
6. **Calendar feeds (ICS)** — token-authenticated per player. More useful here than in GPL,
   because a player's fixtures are self-scheduled and land in their diary one at a time.
7. **Printable sheets and reports.** GPL prints court slips and an order of play, and generates a
   season/session report plus a ready-made prompt for making a flyer. The box-league equivalent is
   a **box card** (one sheet per box: the grid of who plays whom, blank score boxes, everyone's
   contact method) and a **round report**.
8. **Theming via CSS custom properties** (`--league-primary/accent/secondary`) with a derived
   Tailwind palette. Keep it multi-tenant even though Hurlands is one club — the second club is
   the whole point of building it as a product.

### Drop these

Match days, venues-as-scheduling-spine, court assignment, the order-of-play planner, call-to-court,
the TV/live screen, clubs-with-teams-and-squads, DUPR export, booking. A padel box league has
individuals or fixed pairs, not clubs fielding teams, and no single day to run.

### Rules I learned the hard way on GPL — carry them over

- **Never key on a player by name.** Two people genuinely share a name. IDs only.
- **Verify schema with column-level checks** against `information_schema` / `pg_policy`, not the
  migration ledger — dashboard-run SQL does not register in it.
- **Since 30 Oct 2026, new public tables need an explicit `GRANT`** or the Supabase Data API
  returns permission denied. Every migration must grant.
- **Any admin input needs a name that says what it is and a line saying what it is for.**
- Pin `search_path = ''` on `security definer` functions.
- A `<select>` whose `onChange` performs a destructive action is a trap: Chrome changes a focused
  select's value on a mouse wheel. Two steps for anything that moves more than one row.

## What is genuinely new, and needs designing

### 1. The round is a window, not a day

A box round runs 4–6 weeks with a **hard deadline**. Model a round as a date range plus a
deadline, not a match day. Fixtures exist from the moment the boxes are drawn; each one carries
its own self-reported `played_on`.

### 2. Self-scheduling

Design a propose → accept → play → report loop. Padel Fast's ladder rules are a sane starting
point and worth copying deliberately: the proposer must offer **at least two dates**; the opponent
accepts or counter-proposes; if nobody responds before the suggested date passes, it is a
**walkover to the proposer**; a limit on how many open proposals one player can have.

Then decide what happens to a fixture still unplayed at the deadline. GPL's inter-county rules had
a "nobody's fault" case worth 2 game points each — the padel club will need the equivalent:
one side at fault = walkover, both at fault = void or nil-nil, and who adjudicates.

### 3. Individuals or fixed pairs

Padel is doubles. A box league runs either as **fixed pairs** (a pair is the competitor, boxes of
4–6 pairs) or as **individuals who rotate partners** within the box. Make this a per-season
setting from day one; retrofitting it is miserable. Fixed pairs is the simpler v1 and the more
common UK club format — but confirm with the club before choosing.

### 4. Padel scoring

Best of 3 sets: 6 games, 2 clear, tiebreak to 7 at 6–6, golden point on or off, optional
championship/third-set tiebreak, and a **timed-match** option (e.g. 55 minutes) because it is far
easier to fit on booked courts. Standings points model must be configurable: per set won, per
match won, bonus points. Tie-breakers: sets difference, then games difference, then head to head.

### 5. The rating

I want this considered, not assumed. For reference, **Padel Fast's published design** is a sound
starting specification and I am happy to be measured against it:

- One number, 0–10 (also shown ×100 as points), with five named bands: Beginner 0–3,
  Intermediate 3–5, Advanced 5–7, Expert 7–9, Elite 9–10.
- Players **self-declare a starting level** rather than starting at the bottom.
- New players move up to **1.5× faster**, easing back to normal by around 30 rated events.
- Elo-style: predict the result from the gap between the sides, move by the difference between
  expected and actual.
- In doubles, **opponents count as the average of their pair**, but each player is rated on their
  own number — so the lower-rated partner gains more from the same win.
- **Upset bonus**: winning as underdog pays extra; losing as heavy favourite costs extra.
- Higher rating ⇒ smaller gains, larger losses.
- **Result only — the score margin does not move the rating.** The margin decides the standings.
- Every player is evaluated at one fixed rating for a whole event, so **the order results are
  entered never changes the outcome**. (This matters — make it a test.)
- Corrections re-run cleanly.

Separately: I own an RDR rating engine used in my pickleball product (PBTable — see
`Desktop/PBTable-Production/site/index.html`: `replayAllSessions`, `ratingK`, `R_D`, `R_KMIN`,
`R_KMAX`, `R_KHALF`, `R_ALPHA`, `WIN_FLOOR`). **Compare the two approaches and recommend one**,
with the trade-offs stated plainly. Whichever we pick:

- **Explainability is a feature.** Store enough per match that "expected vs actual" can be shown
  from data rather than reconstructed.
- Ratings must be **replayable from scratch** and produce the same answer every time.
- Rating-based **seeding of the first round's boxes** is the obvious first use. Padel Fast only
  seeds when ≥75% of the field is rated and places unrated players mid-field, not bottom — that is
  a good rule, borrow it.
- Make the rating **optional and off by default**, with the UI saying plainly what it does and
  does not yet affect. A demo with every feature switched on cannot test the feature being off.

## Context worth knowing

From Padel Fast's own UK guide, which matches what I would expect: UK padel has passed a million
players across 1,800+ courts at 550+ venues. Box leagues of 4–6 over 4–6 weeks are the standard
starting structure because players book their own courts, and *the known trade-off is that some
matches never get played unless you chase them*. Clubs typically run 3–4 seasons a year of 8–10
weeks, keep divisions to 6–10 players, and finish with a finals night. Court time averages about
£27/hour, so clubs price a season pass to cover courts plus margin.

Competitor shape, for positioning rather than imitation: Padel Fast is event-first (Americano,
Mexicano, King of the Court, Beat the Box, Club Clash, knockout) with leagues layered on, sells at
£4.90 day pass / £9.90 Pro Plus / £24.90 Pro Manager per month, puts league management, ladders and
branding only in the top tier, takes Stripe entry fees, and leans hard on a big-screen venue view.
**Their "Beat the Box" is a 1.5–3 hour single-session format, not a multi-week box league** — the
multi-week box league is what Hurlands is asking for, and it sits in their ladder/league features
rather than that one.

## Constraints

- **Local Supabase only for now.** I am minimising cost until the club commits; no new hosted
  project yet. Set up the local stack and a seed that demonstrates a full round.
- Git repo from the start, pushed to GitHub under `paulberry13-tech`.
- Mobile-first for the player-facing side: the score entry is the phone screen that has to be
  flawless. Admin can assume a laptop.
- Auth: passwordless email OTP, as GPL does.

## What I want back first

Do not start coding. Come back with:

1. What you would lift from GPL unchanged, what you would adapt, and what you would leave behind —
   having actually read the code, not from this brief.
2. The data model for boxes, rounds, fixtures and the self-scheduling loop.
3. A recommendation on fixed pairs vs rotating individuals for v1, with reasons.
4. A rating recommendation: Padel Fast-style Elo vs my RDR engine, and why.
5. The decisions you need from me or the club before building, as a numbered list I can take to
   them — including the unplayed-at-deadline rules.
6. A build order with a first milestone that is demonstrable to the club.

Ask me anything that is genuinely ambiguous. Do not invent club rules — flag them as questions.
