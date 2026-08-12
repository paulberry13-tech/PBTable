-- 004_views.sql — Tournament Manager
-- Computed results live in views so the rules are one-place-changeable (league pattern).
-- All views security_invoker = on: they run under the caller's RLS (everything they read
-- is public-read anyway).

-- ---------------------------------------------------------------- match results

-- Games won per side and points difference, straight from the games rows. The stored
-- winner_entry_id is the organiser-confirmed result used for progression; this view is
-- how "expected vs actual" stays answerable from data.
create view public.match_results
with (security_invoker = on) as
select
  m.id            as match_id,
  m.event_id,
  m.stage,
  m.pool_id,
  m.bracket_kind,
  m.round,
  m.slot,
  m.home_entry_id,
  m.away_entry_id,
  m.winner_entry_id,
  m.best_of,
  count(g.id) filter (where g.home_score is not null)                as games_scored,
  count(g.id) filter (where g.home_score > g.away_score)             as home_games,
  count(g.id) filter (where g.away_score > g.home_score)             as away_games,
  coalesce(sum(g.home_score - g.away_score), 0)                      as home_points_diff
from public.matches m
left join public.games g on g.match_id = m.id
group by m.id;

-- ---------------------------------------------------------------- pool standings

-- Tie-breaks, locked decision 8 (the league's proven rules): matches won, then games
-- won, then points difference. Only decided matches (winner set) count as played.
-- pool_entries is the driving table so 0-played entries still appear.
create view public.pool_standings
with (security_invoker = on) as
with sides as (
  select m.pool_id,
         m.home_entry_id                                        as entry_id,
         case when m.winner_entry_id = m.home_entry_id then 1 else 0 end as won,
         case when m.winner_entry_id = m.away_entry_id then 1 else 0 end as lost,
         mr.home_games                                          as games_won,
         mr.away_games                                          as games_lost,
         mr.home_points_diff                                    as points_diff
    from public.matches m
    join public.match_results mr on mr.match_id = m.id
   where m.stage = 'pool' and m.winner_entry_id is not null
  union all
  select m.pool_id,
         m.away_entry_id,
         case when m.winner_entry_id = m.away_entry_id then 1 else 0 end,
         case when m.winner_entry_id = m.home_entry_id then 1 else 0 end,
         mr.away_games,
         mr.home_games,
         -mr.home_points_diff
    from public.matches m
    join public.match_results mr on mr.match_id = m.id
   where m.stage = 'pool' and m.winner_entry_id is not null
)
select
  p.event_id,
  pe.pool_id,
  pe.entry_id,
  count(s.entry_id)             as played,
  coalesce(sum(s.won), 0)       as won,
  coalesce(sum(s.lost), 0)      as lost,
  coalesce(sum(s.games_won), 0) as games_won,
  coalesce(sum(s.games_lost), 0) as games_lost,
  coalesce(sum(s.points_diff), 0) as points_diff,
  rank() over (
    partition by pe.pool_id
    order by coalesce(sum(s.won), 0)         desc,
             coalesce(sum(s.games_won), 0)   desc,
             coalesce(sum(s.points_diff), 0) desc
  ) as pool_rank
from public.pool_entries pe
join public.pools p on p.id = pe.pool_id
left join sides s on s.pool_id = pe.pool_id and s.entry_id = pe.entry_id
group by p.event_id, pe.pool_id, pe.entry_id;

-- ---------------------------------------------------------------- schedule clashes

-- v1 clash model (locked decision 7): a clash is two matches in the SAME time slot that
-- share a court, or share a player (across ALL events — players enter 2–3 events and
-- this is THE organiser problem). Each clashing pair appears once (match_a < match_b).
create view public.schedule_clashes
with (security_invoker = on) as
with sched as (
  select m.id, ev.tournament_id, m.scheduled_at, m.court,
         m.home_entry_id, m.away_entry_id
    from public.matches m
    join public.events ev on ev.id = m.event_id
   where m.scheduled_at is not null
)
select 'court'::text  as clash_type,
       a.tournament_id,
       a.scheduled_at,
       a.id           as match_a,
       b.id           as match_b,
       a.court,
       null::uuid     as player_id
  from sched a
  join sched b
    on b.tournament_id = a.tournament_id
   and b.scheduled_at  = a.scheduled_at
   and b.court         = a.court
   and a.id < b.id
 where a.court is not null
union all
select distinct 'player'::text,
       a.tournament_id,
       a.scheduled_at,
       a.id,
       b.id,
       null::text,
       pa.player_id
  from sched a
  join public.entry_players pa
    on pa.entry_id in (a.home_entry_id, a.away_entry_id)
  join sched b
    on b.tournament_id = a.tournament_id
   and b.scheduled_at  = a.scheduled_at
   and a.id < b.id
  join public.entry_players pb
    on pb.entry_id in (b.home_entry_id, b.away_entry_id)
   and pb.player_id = pa.player_id;

-- Note: the two accepted Supabase linter warnings for this project concern
-- is_tournament_admin() being SECURITY DEFINER + callable via RPC — see the note in
-- 001_core.sql. Nothing in this file adds new warnings: all views are security_invoker.
