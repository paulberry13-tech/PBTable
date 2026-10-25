-- Inter-County League — 001: core entities
-- counties, teams, players, ratings-with-provenance. Nothing about fixtures yet.

create extension if not exists pgcrypto;

-- Full words, never M/F/O — PBTable migrated off single letters on 2026-08-06
-- because two formats in circulation caused live bugs.
create type gender as enum ('male', 'female', 'other');

-- A DUPR-derived 4.2 and a county-assessor's 4.2 are not the same claim:
-- the source always travels with the value.
create type rating_source as enum (
  'dupr',            -- manually brought across from DUPR
  'county_assessed', -- county assessor's judgement of the player
  'club',            -- PBTable or other club rating, imported as a value (no live FK)
  'league'           -- computed centrally by this league from results
);

create table counties (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- A team is a persistent entity ("Wiltshire A" exists all season);
-- who plays for it is chosen per session (002: squad_players).
create table teams (
  id         uuid primary key default gen_random_uuid(),
  county_id  uuid not null references counties(id),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (county_id, name)
);

create table players (
  id         uuid primary key default gen_random_uuid(),
  county_id  uuid not null references counties(id),
  first_name text not null,
  last_name  text not null,
  gender     gender not null,
  created_at timestamptz not null default now()
);
-- Names are deliberately NOT unique (two live "Steve Reynolds" in PBTable).
-- Never key on name; always use ids and scope queries by county_id.
create index players_county_idx on players (county_id);

create table player_ratings (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id),
  source      rating_source not null,
  value       numeric(6, 3) not null check (value > 0),
  captured_on date not null default current_date,
  -- true when the county has adopted this figure as the player's
  -- carried-forward rating ("compute centrally, adopt optionally")
  adopted     boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);
create index player_ratings_player_idx on player_ratings (player_id, captured_on desc);

-- Current rating per player: most recent adopted row wins, else most recent of any source.
create view player_current_ratings with (security_invoker = on) as
select distinct on (player_id)
  player_id, source, value, captured_on, adopted
from player_ratings
order by player_id, adopted desc, captured_on desc, created_at desc;
