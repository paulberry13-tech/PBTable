-- Inter-County League — 002: competition structure
-- seasons, divisions, sessions, squads, meetings, games, plus integrity triggers.

create type session_status as enum ('scheduled', 'completed');
create type game_type      as enum ('mens_doubles', 'womens_doubles', 'mixed_doubles');
create type game_side      as enum ('home', 'away');

create table seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_on  date,
  ends_on    date,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

create table divisions (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id),
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, name),
  unique (id, season_id)  -- composite FK target so division_teams can pin the season
);

-- Divisions contain TEAMS, not counties: Wiltshire A and B may sit in different divisions.
create table division_teams (
  division_id uuid not null,
  season_id   uuid not null,
  team_id     uuid not null references teams(id),
  primary key (division_id, team_id),
  foreign key (division_id, season_id) references divisions (id, season_id),
  unique (season_id, team_id)  -- a team is in exactly one division per season
);

-- A session is a day's play within a division. Group size is variable (usually 4 teams).
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references divisions(id),
  session_date date not null,
  venue        text,
  status       session_status not null default 'scheduled',
  notes        text,
  created_at   timestamptz not null default now()
);

create table session_teams (
  session_id uuid not null references sessions(id),
  team_id    uuid not null references teams(id),
  primary key (session_id, team_id)
);

-- The squad a team brings to one session. Composition varies each time.
create table squad_players (
  session_id uuid not null,
  team_id    uuid not null,
  player_id  uuid not null references players(id),
  primary key (session_id, team_id, player_id),
  foreign key (session_id, team_id) references session_teams (session_id, team_id)
);

create or replace function enforce_squad_rules() returns trigger
language plpgsql as $$
declare
  squad_size    int;
  player_county uuid;
  team_county   uuid;
begin
  select count(*) into squad_size
  from squad_players
  where session_id = new.session_id and team_id = new.team_id;
  if squad_size >= 8 then
    raise exception 'Squad already has 8 players (max 8 per team per session)';
  end if;

  select county_id into player_county from players where id = new.player_id;
  select county_id into team_county   from teams   where id = new.team_id;
  if player_county is distinct from team_county then
    raise exception 'Player is registered to a different county from this team';
  end if;

  return new;
end $$;

create trigger squad_rules
  before insert on squad_players
  for each row execute function enforce_squad_rules();

-- One county team vs another, within a session. Always 4 games (see games.slot).
create table meetings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id),
  home_team_id uuid not null,
  away_team_id uuid not null,
  created_at   timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  foreign key (session_id, home_team_id) references session_teams (session_id, team_id),
  foreign key (session_id, away_team_id) references session_teams (session_id, team_id)
);
-- The same pair can't meet twice in a session regardless of home/away orientation.
create unique index meetings_unique_pairing
  on meetings (session_id, least(home_team_id, away_team_id), greatest(home_team_id, away_team_id));

create table games (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id),
  slot       smallint not null check (slot between 1 and 4),
  game_type  game_type not null,
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  created_at timestamptz not null default now(),
  unique (meeting_id, slot),
  -- fixed meeting format: 1 men's, 2 women's, 3 & 4 mixed
  check (
    (slot = 1 and game_type = 'mens_doubles') or
    (slot = 2 and game_type = 'womens_doubles') or
    (slot in (3, 4) and game_type = 'mixed_doubles')
  ),
  check ((home_score is null) = (away_score is null)),  -- scores land together or not at all
  check (home_score is null or home_score <> away_score) -- pickleball games can't tie
);
create index games_meeting_idx on games (meeting_id);

create table game_players (
  game_id   uuid not null references games(id),
  player_id uuid not null references players(id),
  side      game_side not null,
  primary key (game_id, player_id)
);

-- Pairs of two, drawn from the right squad, with gender rules.
-- Players with gender 'other' pass the DB checks everywhere; only unambiguous
-- violations (female in men's, male in women's, same-gender mixed pair) are blocked.
create or replace function enforce_game_player_rules() returns trigger
language plpgsql as $$
declare
  g        games%rowtype;
  m        meetings%rowtype;
  team     uuid;
  side_n   int;
  p_gender gender;
begin
  select * into g from games    where id = new.game_id;
  select * into m from meetings where id = g.meeting_id;
  team := case when new.side = 'home' then m.home_team_id else m.away_team_id end;

  if not exists (
    select 1 from squad_players
    where session_id = m.session_id and team_id = team and player_id = new.player_id
  ) then
    raise exception 'Player is not in this team''s squad for the session';
  end if;

  select count(*) into side_n
  from game_players where game_id = new.game_id and side = new.side;
  if side_n >= 2 then
    raise exception 'This side already has 2 players';
  end if;

  select gender into p_gender from players where id = new.player_id;
  if g.game_type = 'mens_doubles' and p_gender = 'female' then
    raise exception 'Men''s doubles cannot include a female player';
  elsif g.game_type = 'womens_doubles' and p_gender = 'male' then
    raise exception 'Women''s doubles cannot include a male player';
  elsif g.game_type = 'mixed_doubles' and p_gender in ('male', 'female') then
    if exists (
      select 1 from game_players gp
      join players p on p.id = gp.player_id
      where gp.game_id = new.game_id and gp.side = new.side and p.gender = p_gender
    ) then
      raise exception 'A mixed doubles pair must include one man and one woman';
    end if;
  end if;

  return new;
end $$;

create trigger game_player_rules
  before insert on game_players
  for each row execute function enforce_game_player_rules();
