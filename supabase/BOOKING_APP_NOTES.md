# Booking app — backend integration notes

How the Expo booking app (`PBTable Bookings/`) plugs into the existing PBTable
Supabase platform. Companion to the three migrations in `supabase/migrations/`.

## What already exists (the engine — we reuse it)

The Production DB (`kxvtqsmjlhlajkoyejwk`) already runs the rating + session engine:

- `clubs`, `club_admins` (admins linked to `auth.users`), `players` (per-club, no
  login), `matches` (doubles results, `p1..p4` are player **names** as text,
  scores `s1/s2`), `activity`.
- `social_sessions` and `session_plans` — session planning, each with a `plan`
  jsonb (the **balanced court slips**, `court_mode = 'ability'`) and scoring.
- `subscriptions` — Stripe billing; `clubs.active` / `subscription_status` gate access.

RDR ratings are **derived from `matches`**, not stored on players — which is exactly
how the POC works (it replays matches through the rating engine).

## What the migrations add (the member-facing layer)

1. `..._schema.sql` — additive only:
   - `players` gains `email`, `user_id → auth.users`, `member_type`, `wallet_pence`.
   - `social_sessions` gains `price_pence`, `affects_rating`, `skill_min/max`,
     `courts`, `booking_status`.
   - new tables `bookings` and `wallet_ledger`.
2. `..._rls.sql` — members read their own club; all money/booking writes are
   blocked at the table level and only happen through the functions.
3. `..._functions.sql` — the trust boundary: `app_book_session`,
   `app_cancel_booking` (24h policy + waitlist promotion), `app_wallet_topup`
   (service-role only, called after Stripe confirms).

## The app swap

- `src/services/supabaseClient.ts` — the client (env: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- `src/services/data.supabase.ts` — implements the same interface as the mock
  `services/data.ts`. Booking/wallet reads and the money RPCs are wired; the
  engine parts (leaderboard, slips, scores) are marked TODO to reuse the existing
  planner/rating code rather than reimplement.
- To go live, point screens at the Supabase module (re-export it from
  `services/data.ts`, or switch the import) once the TODOs below are done.
- `services/auth.ts` still needs swapping to Supabase Auth (the role switcher
  becomes real `club_admins` membership).

## Decisions to confirm before applying

1. **`social_sessions` vs `session_plans`** as the bookable session table. We
   assumed `social_sessions`. If it's `session_plans`, repoint the two FKs and
   the functions — small change.
2. **Linking players to logins.** The 88 existing players have no `user_id`.
   Members need an invite/claim flow (magic link → set `players.user_id`), or
   admins link them. This is the auth piece.
3. **Wallet non-negative invariant / unfunded waitlist promotion.** Current
   functions skip a waitlister who can't afford the seat. Confirm that's the
   desired behaviour.
4. **Payments model.** Wallet top-up only (via a `wallet-topup` Edge Function
   that charges Stripe, then calls `app_wallet_topup` server-side). No
   per-session card charge. Confirm.

## Remaining TODOs to reach a working single club

- Expose the club RDR leaderboard as a Postgres view/function and map it in
  `getLeaderboard` / `getMembers` (rating, games, streak, movement).
- Wire `generateCourtSlips` / `getCourtSlips` to the ability planner
  (`social_sessions.plan`), and `enterScores` to write `matches`.
- Build the `wallet-topup` Edge Function (mirror the `create-checkout-session`
  pattern) and a Stripe webhook branch that calls `app_wallet_topup`.
- Supabase Auth: sign-in + player claim; swap `services/auth.ts`.

## How to apply — SAFELY

Do **not** run these on Production first. Options, in order of preference:

1. **PB Table Demo project** (`ezfpoyuebqjebxdcxyzy`) — apply there, point the app's
   env at it, exercise the flows end-to-end.
2. **A Supabase branch** off Production (via the dashboard / MCP `create_branch`) —
   gets the schema without the data.
3. Only after review, apply to Production. The migrations are additive and use
   `if not exists`, but a real review + a backup/snapshot first is the rule for
   anything touching the live billing DB.
