# Booking app — backend integration notes

How the Expo booking app (`PBTable Bookings/`) maps onto the PBTable Supabase
backend. **Most of this backend already exists** — see below. This file is the
map + the remaining gap, not a from-scratch design.

## What already exists (discovered in the PB Table Demo project)

Demo project `ezfpoyuebqjebxdcxyzy` already has the booking backend, built via
tracked migrations up to `booking_foundations` (2026-07-06):

- **`booking_members`** — the app account: `auth_user_id → auth.users`, `email`,
  `display_name`, optional `player_id → players`, `club_id`. (Kept separate from
  `players` so the rating engine's data stays clean.)
- **`credits_ledger`** — the wallet, in `amount_pennies` (money; the name is
  legacy). `reason` ∈ topup | booking | refund | adjustment; links to `bookings`
  and stripe checkout session. A member's **balance = SUM(amount_pennies)**.
- **`bookings`** — **polymorphic**: `session_kind` ∈ social | graded +
  `session_id`. So BOTH `social_sessions` and `session_plans` are bookable —
  this answers the "which session table" question: **both**. `status` ∈ booked |
  cancelled (no waitlist).
- **`social_sessions`** and **`session_plans`** both已 have `price_pennies` and
  `booking_open`.
- Server functions:
  - `public.book_spot(session_kind, session_id, member_id)` — checks club,
    capacity, booking_open; inserts booking; if `clubs.settings->>'booking_mode'
    = 'paid'` and price > 0, checks balance (raises `insufficient_credit:<pence>`)
    and posts a `-price` `booking` ledger row.
  - `public.session_spots(session_kind, session_id)` — capacity / booked / available.
  - `public.rdr_leaderboard(club_slug)` — the standings (RDR engine +
    `refresh_rdr_standings` cache already exist in `private`).
- `clubs` has `stripe_account_id` / `stripe_charges_enabled` → **Stripe Connect**
  (top-ups pay into each club's connected account).

## The remaining gap (what's NOT built yet)

1. **`cancel_booking` function** — mark booking cancelled + apply the 24-hour
   policy + refund via a `credits_ledger` `refund` row. (No waitlist in the DB
   model, so no promotion branch — simpler than the POC.)
2. **Wallet top-up** — a `create-topup-checkout` Edge Function (Stripe Connect
   Checkout) + a webhook branch that posts a `topup` ledger row on success.
3. **A balance helper** — trivial (`select sum(amount_pennies)`), or a small RPC.
4. **Member auth + player claim** — sign-in, create the `booking_members` row,
   and link it to the right `players` row (by email/name). See #2 in decisions.
5. **App wiring** — point `services/data.ts` at `services/data.supabase.ts`
   (below), and swap `services/auth.ts` to Supabase Auth.

## App side

- `src/services/supabaseClient.ts` — the client (env vars).
- `src/services/data.supabase.ts` — adapter to the **real** schema/RPCs above.
  Reads (sessions from both tables, leaderboard via `rdr_leaderboard`, balance +
  ledger from `credits_ledger`, bookings) and `book_spot` are wired; `cancel` and
  `topUp` call the not-yet-built RPC/function and are marked TODO.

## Identity note (important)

The app's single "Member" concept spans two tables here:
- **Rated player / leaderboard / directory** = `players` (+ RDR standings).
- **Bookable account / wallet / bookings** = `booking_members` (linked to a
  player via `player_id`).
`services/auth.ts` should resolve the signed-in user to a `booking_members` row;
wallet/booking calls use that id, leaderboard/profile use `players`.

## Decisions to confirm

1. **Waitlist.** The existing DB model has none (booked | cancelled only). The
   POC has a waitlist + auto-promotion. Keep it out for v1, or add it?
2. **Member ↔ player linking.** How does a booking account attach to an existing
   player? By email match, admin assignment, or a claim code? (Ties to your
   "email address" question — yes, each member signs in by email and we link
   their `booking_members` row to their `players` row.)
3. **Refund policy in `cancel_booking`** — mirror the POC's 24-hour rule
   (full refund > 24h; none within 24h) as the club default?

## How to apply the remaining gap — SAFELY

The base backend is migration-managed, so a branch off Demo replays it cleanly.
Plan: write the `cancel_booking` + balance + top-up pieces as a new migration,
apply to a **Demo branch**, exercise the flows, then merge to Demo. Never
Production until reviewed.
