-- ============================================================================
-- PBTable Booking App — schema (ADDITIVE)
-- ============================================================================
-- Adds the MEMBER-FACING layer (accounts, wallet, bookings) on top of the
-- existing engine. It only ADDS columns/tables and touches no existing data —
-- same safety posture as supabase-schema.sql (subscriptions).
--
-- Existing tables it builds on (unchanged in structure of data):
--   clubs, players, matches, social_sessions   (the rating + session engine)
--
-- DECISION TO CONFIRM: we treat `social_sessions` as the bookable, member-facing
-- session table (it already has club_id, name, format, capacity, times, and the
-- court-slip `plan` + `scoring` jsonb). If `session_plans` is the canonical one
-- instead, only the FKs below (bookings.session_id, wallet_ledger.session_id)
-- and the functions migration need repointing — everything else is identical.
--
-- Apply to the DEMO project (ezfpoyuebqjebxdcxyzy) or a branch FIRST. Do not run
-- on Production until reviewed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Members = existing players, extended so they can log in, be contacted,
--    and hold a prepaid wallet balance. All columns nullable/defaulted → safe
--    to add to the 88 existing rows.
-- ----------------------------------------------------------------------------
alter table players
  add column if not exists email       text,
  add column if not exists user_id     uuid references auth.users(id) on delete set null,
  add column if not exists member_type text not null default 'member'
      check (member_type in ('member', 'guest', 'junior')),
  -- Cached wallet balance in pence. SOURCE OF TRUTH is wallet_ledger; this is a
  -- running sum kept in step by the server-side functions only (no client write).
  add column if not exists wallet_pence integer not null default 0;

-- One auth user maps to at most one player row.
create unique index if not exists players_user_id_key
  on players(user_id) where user_id is not null;
create index if not exists players_email_idx on players(lower(email));

-- Backfill member_type from the legacy `guest` boolean where present.
update players set member_type = 'guest' where guest is true and member_type = 'member';

-- ----------------------------------------------------------------------------
-- 2. Booking / payment attributes for a bookable session. social_sessions
--    already carries name, format, capacity, times, plan (slips), scoring.
-- ----------------------------------------------------------------------------
alter table social_sessions
  add column if not exists price_pence    integer not null default 600 check (price_pence >= 0),
  add column if not exists affects_rating boolean not null default false,
  add column if not exists skill_min      double precision,
  add column if not exists skill_max      double precision,
  add column if not exists courts         integer,
  add column if not exists booking_status text not null default 'open'
      check (booking_status in ('open', 'closed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 3. Bookings. Waitlist is represented by status = 'waitlisted' with an
--    ordering column, mirroring the app's model (services/data.ts).
-- ----------------------------------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references clubs(id) on delete cascade,
  session_id     uuid not null references social_sessions(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  status         text not null default 'booked'
      check (status in ('booked', 'waitlisted', 'attended', 'no_show', 'cancelled')),
  paid_pence     integer not null default 0,
  refunded_pence integer not null default 0,
  -- 1-based position; NULL unless status = 'waitlisted'.
  waitlist_pos   integer,
  booked_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists bookings_session_idx on bookings(session_id);
create index if not exists bookings_player_idx  on bookings(player_id);

-- A player can hold at most ONE live (booked or waitlisted) booking per session.
create unique index if not exists bookings_one_live_per_session
  on bookings(session_id, player_id)
  where status in ('booked', 'waitlisted');

-- ----------------------------------------------------------------------------
-- 4. Wallet ledger — the audit trail. Every money movement is a row; a player's
--    balance is the running sum (cached on players.wallet_pence). Signed:
--    +deposit/+refund credit the balance, -spend debits it.
-- ----------------------------------------------------------------------------
create table if not exists wallet_ledger (
  id                    uuid primary key default gen_random_uuid(),
  club_id               uuid not null references clubs(id) on delete cascade,
  player_id             uuid not null references players(id) on delete cascade,
  kind                  text not null check (kind in ('deposit', 'spend', 'refund', 'adjustment')),
  amount_pence          integer not null,
  balance_after_pence   integer not null,
  description           text not null,
  session_id            uuid references social_sessions(id) on delete set null,
  -- Set for real Stripe top-ups (the one place money enters the wallet).
  stripe_payment_intent text,
  created_at            timestamptz not null default now()
);

create index if not exists wallet_ledger_player_idx
  on wallet_ledger(player_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Court slips + scores: NO new tables.
--    - Balanced slips already live in social_sessions.plan (jsonb), produced by
--      the existing ability planner (court_mode = 'ability').
--    - Graded scores flow into the existing `matches` table, which the RDR
--      engine already consumes. Booking only gates WHO is on the roster.
-- ----------------------------------------------------------------------------

-- Turn on RLS for the new tables (policies are in the _rls migration).
alter table bookings      enable row level security;
alter table wallet_ledger enable row level security;
