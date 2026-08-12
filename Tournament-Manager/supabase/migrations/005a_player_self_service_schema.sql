create table public.player_accounts (
  user_id       uuid primary key,
  full_name     text not null,
  gender        text not null check (gender in ('male','female','other')),
  date_of_birth date,
  email         text not null,
  phone         text,
  dupr_id       text,
  dupr_rating   numeric(4,2) check (dupr_rating >= 0 and dupr_rating <= 8),
  self_rating   numeric(4,2) check (self_rating >= 0 and self_rating <= 8),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index player_accounts_email_key on public.player_accounts (lower(email));

alter table public.players
  add column account_id    uuid references public.player_accounts(user_id) on delete set null,
  add column date_of_birth date;
create index players_account_idx on public.players (account_id);
create unique index players_one_per_tournament
  on public.players (tournament_id, account_id) where account_id is not null;

alter table public.tournaments
  add column currency               text not null default 'gbp',
  add column registration_opens_at  timestamptz,
  add column registration_closes_at timestamptz,
  add column withdrawal_deadline    timestamptz,
  add column refund_policy          text;

alter table public.tournament_settings
  add column self_service_entries boolean not null default false,
  add column allow_partner_tbc    boolean not null default true;

alter table public.events
  add column entry_fee_pence     integer  not null default 0 check (entry_fee_pence >= 0),
  add column max_entries         smallint check (max_entries > 0),
  add column max_rating          numeric(4,2) check (max_rating >= 0 and max_rating <= 8),
  add column min_rating          numeric(4,2) check (min_rating >= 0 and min_rating <= 8),
  add column combined_rating_max numeric(5,2),
  add column min_age             smallint check (min_age between 0 and 100),
  add column max_age             smallint check (max_age between 0 and 100);

alter table public.entries drop constraint entries_status_check;
alter table public.entries add constraint entries_status_check
  check (status in ('incomplete','entered','waitlisted','withdrawn'));
alter table public.entries
  add column created_by_account uuid references public.player_accounts(user_id) on delete set null,
  add column withdrawn_at       timestamptz;

create table public.entry_invitations (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references public.entries(id) on delete cascade,
  invited_by       uuid not null references public.player_accounts(user_id) on delete cascade,
  invited_email    text not null,
  invited_account  uuid references public.player_accounts(user_id) on delete set null,
  token            text not null unique default encode(gen_random_bytes(18), 'hex'),
  status           text not null default 'pending'
                   check (status in ('pending','accepted','declined','cancelled','superseded')),
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);
create index entry_invitations_entry_idx on public.entry_invitations (entry_id);
create index entry_invitations_email_idx on public.entry_invitations (lower(invited_email))
  where status = 'pending';

create table public.entry_payments (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  account_id    uuid references public.player_accounts(user_id) on delete set null,
  amount_pence  integer not null check (amount_pence >= 0),
  currency      text not null default 'gbp',
  status        text not null default 'pending'
                check (status in ('pending','paid','waived','refunded','failed')),
  stripe_session_id     text,
  stripe_payment_intent text,
  paid_at       timestamptz,
  refunded_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (entry_id, player_id)
);
create index entry_payments_account_idx on public.entry_payments (account_id);
create index entry_payments_session_idx on public.entry_payments (stripe_session_id);
