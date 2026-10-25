-- Inter-County League — 005: booking framework, phase 1
--
-- Two additions:
--   * players.default_team_id — a SOFT preference used for public display and squad
--     prefill. County registration (players.county_id) remains the eligibility truth;
--     a player can still be picked for any of their county's teams session by session.
--   * session_availability — who can play in an upcoming session. Captains/admin turn
--     availability into squad_players picks.
--
-- Writes stay admin-only under RLS for now. Player self-service (auth-linked players
-- marking their own availability) is a later phase and will need a players↔auth link.

alter table players add column default_team_id uuid references teams(id);

create or replace function enforce_default_team_county() returns trigger
language plpgsql set search_path = '' as $$
declare team_county uuid;
begin
  if new.default_team_id is not null then
    select county_id into team_county from public.teams where id = new.default_team_id;
    if team_county is distinct from new.county_id then
      raise exception 'Default team belongs to a different county from the player';
    end if;
  end if;
  return new;
end $$;

create trigger default_team_county
  before insert or update of default_team_id, county_id on players
  for each row execute function enforce_default_team_county();

create type availability_status as enum ('available', 'unavailable');

create table session_availability (
  session_id uuid not null references sessions(id),
  player_id  uuid not null references players(id),
  status     availability_status not null,
  noted_at   timestamptz not null default now(),
  primary key (session_id, player_id)
);

alter table session_availability enable row level security;
create policy "public read" on session_availability for select using (true);
create policy "admin write" on session_availability
  for all using (is_league_admin()) with check (is_league_admin());
