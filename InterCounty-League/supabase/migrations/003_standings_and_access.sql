-- Inter-County League — 003: results/standings views + access model
-- Scoring rules (locked with Paul 2026-08-08):
--   meeting won on games (of 4); 2-2 decided by aggregate points difference;
--   dead level (2-2 and diff 0) is a draw. Table: 1 point per meeting win,
--   0.5 for a dead-level draw (confirmed by Paul 2026-08-08).
--   Tie-breakers: league points, then games won, then points difference.

create view meeting_results with (security_invoker = on) as
select
  m.id  as meeting_id,
  m.session_id,
  s.division_id,
  m.home_team_id,
  m.away_team_id,
  count(g.id) filter (where g.home_score is not null)     as games_recorded,
  count(*)    filter (where g.home_score > g.away_score)  as home_games_won,
  count(*)    filter (where g.away_score > g.home_score)  as away_games_won,
  coalesce(sum(g.home_score - g.away_score), 0)           as home_points_diff
from meetings m
join sessions s on s.id = m.session_id
left join games g on g.meeting_id = m.id
group by m.id, m.session_id, s.division_id, m.home_team_id, m.away_team_id;

create view standings with (security_invoker = on) as
with completed as (
  select *,
    case
      when home_games_won > away_games_won then 'home'
      when away_games_won > home_games_won then 'away'
      when home_points_diff > 0 then 'home'
      when home_points_diff < 0 then 'away'
      else 'draw'
    end as winner
  from meeting_results
  where games_recorded = 4   -- a meeting counts once all 4 games are in
),
per_team as (
  select division_id, home_team_id as team_id,
         (winner = 'home')::int as won,
         (winner = 'away')::int as lost,
         (winner = 'draw')::int as drawn,
         home_games_won   as games_won,
         away_games_won   as games_lost,
         home_points_diff as points_diff
  from completed
  union all
  select division_id, away_team_id,
         (winner = 'away')::int,
         (winner = 'home')::int,
         (winner = 'draw')::int,
         away_games_won,
         home_games_won,
         -home_points_diff
  from completed
)
select
  d.season_id,
  p.division_id,
  t.id   as team_id,
  t.name as team,
  count(*)         as played,
  sum(p.won)       as won,
  sum(p.lost)      as lost,
  sum(p.drawn)     as drawn,
  sum(p.won) + 0.5 * sum(p.drawn) as league_points,
  sum(p.games_won)   as games_won,
  sum(p.games_lost)  as games_lost,
  sum(p.points_diff) as points_diff
from per_team p
join teams t     on t.id = p.team_id
join divisions d on d.id = p.division_id
group by d.season_id, p.division_id, t.id, t.name
order by p.division_id, league_points desc, games_won desc, points_diff desc;

-- Access model: league admin > (county captain, later) > public.
-- Designed fresh — deliberately NOT PBTable's clubs/club_admins shape.
create table league_admins (
  user_id  uuid primary key references auth.users (id),
  added_at timestamptz not null default now()
);
-- Bootstrap: insert the first admin from the Supabase dashboard (service role);
-- RLS below means no one can self-appoint.

create or replace function is_league_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.league_admins where user_id = auth.uid())
$$;

-- Public read-only tables/fixtures/results at launch; all writes admin-only.
do $$
declare t text;
begin
  foreach t in array array[
    'counties', 'teams', 'players', 'player_ratings',
    'seasons', 'divisions', 'division_teams',
    'sessions', 'session_teams', 'squad_players',
    'meetings', 'games', 'game_players'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format(
      'create policy "admin write" on %I for all using (is_league_admin()) with check (is_league_admin())', t);
  end loop;
end $$;

alter table league_admins enable row level security;
create policy "admins can see admins" on league_admins
  for select using (is_league_admin());
