-- 001_core.sql — Tournament Manager
-- tournaments, admins, settings, players, ratings-with-provenance, events.
-- RLS everywhere: public read + admin write. Patterns carried from InterCounty-League
-- migrations 001/003/004: search_path pinned on every function, SECURITY DEFINER admin
-- check, security_invoker views, gender as full words.

-- ---------------------------------------------------------------- tournaments

create table public.tournaments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  venue      text,                                   -- free text until venues need managing
  start_date date not null,
  end_date   date,                                   -- null = single-day event
  notes      text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------- admins

-- Admins are project-wide (the league model). Bootstrap the first row from the dashboard
-- SQL editor (service role bypasses RLS); the policies below prevent self-appointment.
-- email is informational only — never used for lookups.
create table public.tournament_admins (
  user_id    uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.is_tournament_admin()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_admins a where a.user_id = auth.uid()
  );
$$;
-- The Supabase linter will warn that a SECURITY DEFINER function is callable via RPC.
-- Accepted deliberately (league 003/004 precedent): it reveals only whether the caller
-- themselves is an admin.

-- ---------------------------------------------------------------- settings

-- One row per tournament, auto-created. Few toggles on purpose; defaults chosen so the
-- OFF path gets exercised (league lesson: a demo with everything on can't test anything off).
create table public.tournament_settings (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  courts_count  smallint not null default 4  check (courts_count between 1 and 32),
  slot_minutes  smallint not null default 20 check (slot_minutes between 5 and 120),
  checkin_required_for_scoring boolean not null default true,
  ratings_public boolean not null default false
);

create or replace function public.create_default_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.tournament_settings (tournament_id)
  values (new.id)
  on conflict (tournament_id) do nothing;
  return null;
end;
$$;

create trigger tournaments_default_settings
after insert on public.tournaments
for each row execute function public.create_default_settings();

-- ---------------------------------------------------------------- players

-- Players are scoped per tournament (no cross-tournament identity in v1; a series/
-- rankings concept would revisit this). NEVER key on name — duplicates are legal.
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,
  gender        text not null check (gender in ('male','female','other')),  -- full words, never M/F/O
  email         text,
  phone         text,
  checked_in    boolean not null default false,      -- day-of check-in flag (organiser-set)
  checked_in_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);
create index players_tournament_idx on public.players (tournament_id);

-- Ratings always carry provenance: a DUPR 4.0 and a self-assessed 4.0 are different
-- claims, and seeding runs off these numbers.
create table public.player_ratings (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  source      text not null,                         -- 'DUPR' | 'self' | 'organiser' | ...
  value       numeric(4,2) not null check (value >= 0 and value <= 8),
  captured_on date not null,
  notes       text
);
create index player_ratings_player_idx on public.player_ratings (player_id);

create view public.player_current_ratings
with (security_invoker = on) as
select distinct on (pr.player_id, pr.source)
       pr.player_id, pr.source, pr.value, pr.captured_on, pr.notes
from public.player_ratings pr
order by pr.player_id, pr.source, pr.captured_on desc;

-- ---------------------------------------------------------------- events

-- An event is one competition within the tournament (e.g. "Mixed Doubles 3.0–3.5").
-- Scoring config is per event AND per stage (locked decision 5): the three stage formats
-- below are copied onto matches at draw time, so per-match overrides come free and the
-- rules that scored a match are stored with it (explainability).
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,
  discipline    text not null check (discipline in ('singles','doubles')),
  category      text not null check (category in ('mens','womens','mixed','open')),
  band_label    text,                                -- free text: '3.0–3.5', '50+', null = open band
  seeding_rating_source text,                        -- which ratings source seeds this event; null = organiser-ordered
  display_order smallint not null default 0,

  -- stage formats: pool games, bracket rounds before the final, the final itself
  pool_best_of     smallint not null default 1  check (pool_best_of in (1,3,5)),
  pool_points_to   smallint not null default 11 check (pool_points_to between 5 and 51),
  pool_win_by      smallint not null default 2  check (pool_win_by in (1,2)),
  bracket_best_of  smallint not null default 1  check (bracket_best_of in (1,3,5)),
  bracket_points_to smallint not null default 15 check (bracket_points_to between 5 and 51),
  bracket_win_by   smallint not null default 2  check (bracket_win_by in (1,2)),
  final_best_of    smallint not null default 3  check (final_best_of in (1,3,5)),
  final_points_to  smallint not null default 11 check (final_points_to between 5 and 51),
  final_win_by     smallint not null default 2  check (final_win_by in (1,2)),

  created_at    timestamptz not null default now(),
  unique (tournament_id, name),
  check (not (discipline = 'singles' and category = 'mixed'))
);
create index events_tournament_idx on public.events (tournament_id);

-- ---------------------------------------------------------------- RLS

alter table public.tournaments        enable row level security;
alter table public.tournament_admins  enable row level security;
alter table public.tournament_settings enable row level security;
alter table public.players            enable row level security;
alter table public.player_ratings     enable row level security;
alter table public.events             enable row level security;

create policy "public read" on public.tournaments         for select using (true);
create policy "public read" on public.tournament_settings for select using (true);
create policy "public read" on public.players             for select using (true);
create policy "public read" on public.player_ratings      for select using (true);
create policy "public read" on public.events              for select using (true);

create policy "admin write" on public.tournaments for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.tournament_settings for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.players for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.player_ratings for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.events for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());

-- admins table: readable/writable by admins only (no public read — and no
-- self-appointment: an insert requires the caller to already be an admin)
create policy "admin read"  on public.tournament_admins for select
  using (public.is_tournament_admin());
create policy "admin write" on public.tournament_admins for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
