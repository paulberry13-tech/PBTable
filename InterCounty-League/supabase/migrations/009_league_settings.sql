-- Inter-County League — 009: per-season league settings
--
-- Deliberately a SMALL set of switches. Every toggle doubles the test surface, and
-- PBTable taught us the expensive version of that lesson: a demo with every feature
-- switched on cannot test a feature being switched off. Defaults below are chosen so
-- the "off" path is exercised too (ratings_enabled starts false).
--
-- Not configurable on purpose:
--   * the match format (1 men's, 1 women's, 2 mixed) — baked into slot checks and the
--     gender triggers; a different format is a schema conversation, not a checkbox
--   * the 2-2-on-points-difference rule — it lives in the result view, the promotion
--     ordering, the playoff mini-table and the admin preview; four places to keep in sync

create type promotion_mode as enum ('off', 'per_session');

create table league_settings (
  season_id           uuid primary key references seasons(id),
  -- ratings: computing them and publishing them are separate decisions.
  -- Whether a county ADOPTS the league figure stays per-county by design
  -- ("compute centrally, adopt optionally") — it is not a league-wide switch.
  ratings_enabled     boolean not null default false,   -- governs the (not yet built) engine
  ratings_public      boolean not null default true,    -- show ratings on the public site
  player_stats_public boolean not null default true,    -- show the Players/Pairings section
  promotion_mode      promotion_mode not null default 'per_session',
  max_squad_size      smallint not null default 8 check (max_squad_size between 4 and 16),
  updated_at          timestamptz not null default now()
);

alter table league_settings enable row level security;
create policy "public read" on league_settings for select using (true);
create policy "admin write" on league_settings
  for all using (is_league_admin()) with check (is_league_admin());

insert into league_settings (season_id) select id from seasons;

-- Squad cap now comes from settings rather than being hardcoded at 8.
-- search_path is pinned (see 004), so every reference must be schema-qualified.
create or replace function enforce_squad_rules() returns trigger
language plpgsql set search_path = '' as $$
declare
  squad_size    int;
  player_county uuid;
  team_county   uuid;
  cap           int;
begin
  select ls.max_squad_size into cap
  from public.sessions s
  join public.divisions d on d.id = s.division_id
  left join public.league_settings ls on ls.season_id = d.season_id
  where s.id = new.session_id;
  cap := coalesce(cap, 8);

  select count(*) into squad_size
  from public.squad_players
  where session_id = new.session_id and team_id = new.team_id;
  if squad_size >= cap then
    raise exception 'Squad already has % players (max % per team per session)', squad_size, cap;
  end if;

  select county_id into player_county from public.players where id = new.player_id;
  select county_id into team_county   from public.teams   where id = new.team_id;
  if player_county is distinct from team_county then
    raise exception 'Player is registered to a different county from this team';
  end if;

  return new;
end $$;
