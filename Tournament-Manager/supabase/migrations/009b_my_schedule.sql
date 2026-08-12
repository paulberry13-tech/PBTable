-- A player's own order of play: when, where, against whom. Court may still be null
-- (assigned on the day as courts free up) and the time is a plan, so the page pairs this
-- with running_late_minutes() to show an honest estimate rather than a false promise.
create or replace function public.my_schedule(p_tournament uuid)
returns table (
  match_id uuid, event_name text, stage text, round smallint,
  court text, scheduled_at timestamptz,
  my_side text, my_line_up text, opponent text,
  decided boolean, i_won boolean, score text)
language sql security definer set search_path = '' as $$
  with mine as (
    select m.*, ev.name as ev_name, ev.discipline,
           (select bool_or(p.account_id = auth.uid())
              from public.entry_players ep join public.players p on p.id = ep.player_id
             where ep.entry_id = m.home_entry_id) as is_home
      from public.matches m
      join public.events ev on ev.id = m.event_id
     where ev.tournament_id = p_tournament
       and exists (
         select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
          where ep.entry_id in (m.home_entry_id, m.away_entry_id)
            and p.account_id = auth.uid())
  )
  select mn.id, mn.ev_name, mn.stage, mn.round, mn.court, mn.scheduled_at,
         case when mn.is_home then 'home' else 'away' end,
         (select string_agg(p.name, ' & ' order by p.name)
            from public.entry_players ep join public.players p on p.id = ep.player_id
           where ep.entry_id = case when mn.is_home then mn.home_entry_id else mn.away_entry_id end),
         (select string_agg(p.name, ' & ' order by p.name)
            from public.entry_players ep join public.players p on p.id = ep.player_id
           where ep.entry_id = case when mn.is_home then mn.away_entry_id else mn.home_entry_id end),
         mn.winner_entry_id is not null,
         mn.winner_entry_id = case when mn.is_home then mn.home_entry_id else mn.away_entry_id end,
         (select string_agg(
                   case when mn.is_home then g.home_score || '-' || g.away_score
                        else g.away_score || '-' || g.home_score end, ', ' order by g.game_no)
            from public.games g where g.match_id = mn.id and g.home_score is not null)
  from mine mn
  where auth.uid() is not null
  order by mn.scheduled_at nulls last, mn.court;
$$;
