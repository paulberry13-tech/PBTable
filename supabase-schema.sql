-- ============================================================
-- PBTable — subscriptions table (integrates with your EXISTING database)
-- Safe to run on PBTable Production: it ADDS one new table and
-- touches nothing in clubs / club_admins / players / matches / activity.
--
-- Run ONCE: Supabase (PBTable Production) -> SQL Editor -> New query
-- -> paste this whole file -> Run.
-- ============================================================

create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),

  -- Links to your real club once you onboard them. Stays NULL until then,
  -- so a brand-new paying customer is recorded even before they're a club.
  club_id                uuid references clubs(id) on delete set null,

  -- Captured from the order form so you can onboard them manually:
  contact_name           text,
  contact_email          text not null,
  club_name              text,          -- the club name they typed when ordering

  -- Stripe linkage + the "rent light":
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 text not null default 'incomplete', -- active | past_due | canceled | ...
  plan                   text,          -- 'founder' | 'club'
  billing                text,          -- 'monthly' | 'annual'
  price_id               text,          -- the Stripe price used
  current_period_end     timestamptz,   -- when it next renews / ends

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_subscriptions_club     on subscriptions(club_id);
create index if not exists idx_subscriptions_customer on subscriptions(stripe_customer_id);

-- Lock it down: only the server-side functions (service-role key) may touch it.
-- The public website and anonymous visitors get NO direct access. Your existing
-- tables and their policies are unaffected.
alter table subscriptions enable row level security;
