-- 003_competition.sql — Tournament Manager
-- pools, matches (with bracket progression), games. The bracket is modelled with
-- winner_advances_to / loser_advances_to from day one (locked decision 1): saving a
-- deciding result advances the winner into their next slot via trigger, and back draws
-- (bracket_kind='consolation' + loser_advances_to) are an addition, not a rebuild.
--
-- Who plays a match comes from its entries (entry_players) — there is deliberately NO
-- game_players table: unlike the league's rotating squads, a tournament pair IS the entry.

-- ---------------------------------------------------------------- pools

create table public.pools (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  name          text not null,                        -- 'Pool A'
  display_order smallint not null default 0,
  unique (event_id, name)
);

create table public.pool_entries (
  pool_id  uuid not null references public.pools(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  primary key (pool_id, entry_id)
);
create index pool_entries_entry_idx on public.pool_entries (entry_id);

create or replace function public.enforce_pool_entries()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pool_event  uuid;
  v_entry_event uuid;
begin
  select p.event_id into v_pool_event  from public.pools   p where p.id = new.pool_id;
  select e.event_id into v_entry_event from public.entries e where e.id = new.entry_id;

  if v_pool_event <> v_entry_event then
    raise exception 'entry belongs to a different event than the pool';
  end if;

  if exists (
    select 1
      from public.pool_entries pe
      join public.pools p on p.id = pe.pool_id
     where pe.entry_id = new.entry_id
       and p.event_id  = v_pool_event
       and pe.pool_id <> new.pool_id
  ) then
    raise exception 'entry is already in another pool of this event';
  end if;

  return null;
end;
$$;

create trigger pool_entries_integrity
after insert or update on public.pool_entries
for each row execute function public.enforce_pool_entries();

-- ---------------------------------------------------------------- matches

-- One row per match, pool or bracket. Sides are nullable because bracket slots are
-- unknown until the feeding match resolves. best_of/points_to/win_by are copied from the
-- event's stage config at draw time — the rules that scored a match live with it.
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  stage         text not null check (stage in ('pool','bracket')),
  pool_id       uuid references public.pools(id) on delete cascade,
  bracket_kind  text not null default 'main' check (bracket_kind in ('main','consolation')),
  round         smallint check (round > 0),          -- bracket: 1 = first round; null for pool matches
  slot          smallint,                            -- position within round (layout) / pool match order

  home_entry_id   uuid references public.entries(id),
  away_entry_id   uuid references public.entries(id),
  winner_entry_id uuid references public.entries(id),

  winner_advances_to   uuid references public.matches(id),
  winner_advances_side text check (winner_advances_side in ('home','away')),
  loser_advances_to    uuid references public.matches(id),
  loser_advances_side  text check (loser_advances_side in ('home','away')),

  best_of   smallint not null default 1  check (best_of in (1,3,5)),
  points_to smallint not null default 11 check (points_to between 5 and 51),
  win_by    smallint not null default 2  check (win_by in (1,2)),

  court        text,                                 -- free text: '1', 'Court 3', 'Show court'
  scheduled_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),

  check (stage <> 'pool' or pool_id is not null),
  check (stage <> 'bracket' or round is not null),
  check (home_entry_id is null or away_entry_id is null or home_entry_id <> away_entry_id),
  check ((winner_advances_to is null) = (winner_advances_side is null)),
  check ((loser_advances_to is null) = (loser_advances_side is null))
);
create index matches_event_idx on public.matches (event_id);
create index matches_pool_idx  on public.matches (pool_id);
create index matches_sched_idx on public.matches (scheduled_at);

create or replace function public.enforce_match_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ev uuid;
begin
  if new.pool_id is not null then
    select p.event_id into v_ev from public.pools p where p.id = new.pool_id;
    if v_ev <> new.event_id then
      raise exception 'pool belongs to a different event than the match';
    end if;
  end if;

  if new.home_entry_id is not null then
    select e.event_id into v_ev from public.entries e where e.id = new.home_entry_id;
    if v_ev <> new.event_id then
      raise exception 'home entry belongs to a different event than the match';
    end if;
  end if;

  if new.away_entry_id is not null then
    select e.event_id into v_ev from public.entries e where e.id = new.away_entry_id;
    if v_ev <> new.event_id then
      raise exception 'away entry belongs to a different event than the match';
    end if;
  end if;

  if new.winner_entry_id is not null
     and new.winner_entry_id is distinct from new.home_entry_id
     and new.winner_entry_id is distinct from new.away_entry_id then
    raise exception 'winner must be one of the two sides of the match';
  end if;

  return new;
end;
$$;

create trigger matches_refs
before insert or update on public.matches
for each row execute function public.enforce_match_refs();

-- ---------------------------------------------------------------- games

-- All game rows are created up front at draw time (best_of of them) so score day is
-- pure fill-in; unused games in a short match simply stay null.
create table public.games (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  game_no    smallint not null check (game_no between 1 and 5),
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  unique (match_id, game_no),
  check ((home_score is null) = (away_score is null))   -- a game is scored whole or not at all
);
create index games_match_idx on public.games (match_id);

-- Backstop for scoring: both sides must be known, and (when the setting is on — it reads
-- tournament_settings, the league's max_squad_size pattern) every player in the match
-- must be checked in.
create or replace function public.enforce_game_scoring()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_home uuid;
  v_away uuid;
  v_tid  uuid;
  v_req  boolean;
begin
  if new.home_score is null then
    return new;                                       -- clearing / creating blank rows is always fine
  end if;

  select m.home_entry_id, m.away_entry_id, ev.tournament_id
    into v_home, v_away, v_tid
    from public.matches m
    join public.events ev on ev.id = m.event_id
   where m.id = new.match_id;

  if v_home is null or v_away is null then
    raise exception 'both sides of the match must be set before scores are recorded';
  end if;

  select s.checkin_required_for_scoring into v_req
    from public.tournament_settings s
   where s.tournament_id = v_tid;

  if coalesce(v_req, true) and exists (
      select 1
        from public.entry_players ep
        join public.players p on p.id = ep.player_id
       where ep.entry_id in (v_home, v_away)
         and not p.checked_in
  ) then
    raise exception 'every player in this match must be checked in before scoring (tournament_settings.checkin_required_for_scoring)';
  end if;

  return new;
end;
$$;

create trigger games_scoring
before insert or update on public.games
for each row execute function public.enforce_game_scoring();

-- ---------------------------------------------------------------- progression

-- Fill one side of a match, refusing to disturb a match that already has scores.
create or replace function public.fill_match_side(p_match uuid, p_side text, p_entry uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current uuid;
  v_scored  int;
begin
  if p_side = 'home' then
    select m.home_entry_id into v_current from public.matches m where m.id = p_match;
  else
    select m.away_entry_id into v_current from public.matches m where m.id = p_match;
  end if;

  if v_current is not distinct from p_entry then
    return;                                           -- re-save with the same outcome: no-op
  end if;

  select count(*) into v_scored
    from public.games g
   where g.match_id = p_match and g.home_score is not null;
  if v_scored > 0 then
    raise exception 'cannot change the % side of a match that already has scores recorded — clear its games first', p_side;
  end if;

  if p_side = 'home' then
    update public.matches set home_entry_id = p_entry where id = p_match;
  else
    update public.matches set away_entry_id = p_entry where id = p_match;
  end if;
end;
$$;

-- When a match's winner is set (or corrected, or cleared), push the winner — and the
-- loser, once back draws exist — into their next slots. Fires only on updates that SET
-- winner_entry_id, and fill_match_side updates home/away only, so it cannot cascade
-- into itself.
create or replace function public.advance_after_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_loser uuid;
begin
  if new.winner_entry_id is not null then
    v_loser := case when new.winner_entry_id = new.home_entry_id
                    then new.away_entry_id
                    else new.home_entry_id end;
  end if;

  if new.winner_advances_to is not null then
    perform public.fill_match_side(new.winner_advances_to, new.winner_advances_side,
                                   new.winner_entry_id);
  end if;

  if new.loser_advances_to is not null then
    perform public.fill_match_side(new.loser_advances_to, new.loser_advances_side,
                                   case when new.winner_entry_id is null then null else v_loser end);
  end if;

  return null;
end;
$$;

create trigger matches_advance
after update of winner_entry_id on public.matches
for each row execute function public.advance_after_result();

-- ---------------------------------------------------------------- RLS

alter table public.pools        enable row level security;
alter table public.pool_entries enable row level security;
alter table public.matches      enable row level security;
alter table public.games        enable row level security;

create policy "public read" on public.pools        for select using (true);
create policy "public read" on public.pool_entries for select using (true);
create policy "public read" on public.matches      for select using (true);
create policy "public read" on public.games        for select using (true);

create policy "admin write" on public.pools for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.pool_entries for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.matches for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.games for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
