-- Inter-County League — 008: promotion/relegation ladder + playoff sessions
--
-- LADDER MODEL (locked with Paul 2026-08-10)
-- Movement happens after every *session*, not at season end — a session is a box:
-- the teams in it play each other, the winner goes up a division and the bottom team
-- goes down. The top division's winner has nowhere to go (stays); likewise the bottom
-- division's loser. Movement is applied by an admin from the score-entry screen after
-- previewing it — never automatically, because scores get corrected.
--
-- `division_teams.position` is the division's display order for admins. Paul's rule:
-- a promoted team enters its new (higher) division at position 4, a relegated team
-- enters its new (lower) division at position 1. It is presentation only — nothing in
-- results, standings or selection reads it.
--
-- `division_movements` is the audit trail: what moved, which way, after which session.
--
-- PLAYOFFS
-- A playoff is just a session flagged as one, so it reuses the whole scoring path.
-- It is excluded from `standings` and never triggers promotion/relegation. Teams may
-- be drawn from any division (e.g. a champions' finals day); `division_id` records
-- which division hosts it.

create type session_kind as enum ('league', 'playoff');

alter table sessions add column session_kind session_kind not null default 'league';
alter table sessions add column stage text;   -- free text: 'Championship Finals', 'Div 2 Play-off'

alter table division_teams add column position smallint;

create table division_movements (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references seasons(id),
  team_id          uuid not null references teams(id),
  from_division_id uuid references divisions(id),
  to_division_id   uuid references divisions(id),
  after_session_id uuid references sessions(id),
  direction        text not null check (direction in ('promoted', 'relegated')),
  moved_at         timestamptz not null default now()
);
create index division_movements_session_idx on division_movements (after_session_id);

alter table division_movements enable row level security;
create policy "public read" on division_movements for select using (true);
create policy "admin write" on division_movements
  for all using (is_league_admin()) with check (is_league_admin());

-- Views must be rebuilt so playoff results never reach the league table.
drop view standings;
drop view meeting_results;

create view meeting_results with (security_invoker = on) as
select
  m.id  as meeting_id,
  m.session_id,
  s.division_id,
  s.session_kind,
  m.home_team_id,
  m.away_team_id,
  count(g.id) filter (where g.home_score is not null)     as games_recorded,
  count(*)    filter (where g.home_score > g.away_score)  as home_games_won,
  count(*)    filter (where g.away_score > g.home_score)  as away_games_won,
  coalesce(sum(g.home_score - g.away_score), 0)           as home_points_diff
from meetings m
join sessions s on s.id = m.session_id
left join games g on g.meeting_id = m.id
group by m.id, m.session_id, s.division_id, s.session_kind, m.home_team_id, m.away_team_id;

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
  where games_recorded = 4
    and session_kind = 'league'   -- playoffs never count toward the table
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
