-- 1. CLASHES BY OVERLAP, NOT BY IDENTICAL TIMESTAMP.
-- The old view only caught matches sharing an exact start time, so 10:00 and 10:15 on the
-- same court looked fine even though a 30-minute match plainly overlaps. Each match now
-- occupies a window: slot_minutes x (1 game for a single-game format, 2 for best-of-3+),
-- and two matches clash if their windows intersect at all.
create or replace view public.schedule_clashes
with (security_invoker = on) as
with sched as (
  select m.id, ev.tournament_id, m.scheduled_at, m.court,
         m.home_entry_id, m.away_entry_id,
         (coalesce(s.slot_minutes, 20) * (case when m.best_of = 1 then 1 else 2 end))
           * interval '1 minute' as dur
    from public.matches m
    join public.events ev on ev.id = m.event_id
    left join public.tournament_settings s on s.tournament_id = ev.tournament_id
   where m.scheduled_at is not null
)
select 'court'::text as clash_type,
       a.tournament_id, a.scheduled_at, a.id as match_a, b.id as match_b,
       a.court, null::uuid as player_id
  from sched a
  join sched b
    on b.tournament_id = a.tournament_id
   and b.court = a.court
   and a.id < b.id
   and a.scheduled_at < b.scheduled_at + b.dur      -- classic interval overlap
   and b.scheduled_at < a.scheduled_at + a.dur
 where a.court is not null
union all
select distinct 'player'::text,
       a.tournament_id, a.scheduled_at, a.id, b.id, null::text, pa.player_id
  from sched a
  join public.entry_players pa
    on pa.entry_id in (a.home_entry_id, a.away_entry_id)
  join sched b
    on b.tournament_id = a.tournament_id
   and a.id < b.id
   and a.scheduled_at < b.scheduled_at + b.dur
   and b.scheduled_at < a.scheduled_at + a.dur
  join public.entry_players pb
    on pb.entry_id in (b.home_entry_id, b.away_entry_id)
   and pb.player_id = pa.player_id;

-- 2. WHEN A MATCH ACTUALLY FINISHED.
-- Stamped automatically the first time a winner is recorded, so the organiser does no
-- extra work — this is what turns "planned 11:40" into an honest "about 11:55".
alter table public.matches add column completed_at timestamptz;

create or replace function public.stamp_match_completion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.winner_entry_id is not null and old.winner_entry_id is null then
    new.completed_at := now();
  elsif new.winner_entry_id is null then
    new.completed_at := null;          -- result cleared: the match is live again
  end if;
  return new;
end;
$$;

create trigger matches_completion_stamp
before update of winner_entry_id on public.matches
for each row execute function public.stamp_match_completion();

-- 3. HOW LATE THE DAY IS RUNNING.
-- Measured from the last few finishes against their planned end. Averaging the recent
-- ones rather than all of them means the number tracks the day as it recovers or slips,
-- instead of being anchored by a slow first round.
create or replace function public.running_late_minutes(p_tournament uuid)
returns integer language sql stable set search_path = '' as $$
  with recent as (
    select extract(epoch from (m.completed_at
             - (m.scheduled_at
                + (coalesce(s.slot_minutes, 20)
                   * (case when m.best_of = 1 then 1 else 2 end)) * interval '1 minute')))
             / 60 as late
      from public.matches m
      join public.events ev on ev.id = m.event_id
      left join public.tournament_settings s on s.tournament_id = ev.tournament_id
     where ev.tournament_id = p_tournament
       and m.completed_at is not null and m.scheduled_at is not null
     order by m.completed_at desc
     limit 6
  )
  select greatest(0, round(coalesce(avg(late), 0))::int) from recent;
$$;
