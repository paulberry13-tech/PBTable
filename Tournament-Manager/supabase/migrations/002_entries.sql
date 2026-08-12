-- 002_entries.sql — Tournament Manager
-- entries = (player | pair) × event. Integrity triggers are the DB backstop for what
-- the admin UI enforces (league pattern; row AFTER triggers DO see statement-siblings
-- in a multi-row insert — tested there).

create table public.entries (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  status     text not null default 'entered'
             check (status in ('entered','waitlisted','withdrawn')),
  seed       smallint check (seed > 0),  -- final seed order used for the draw (1 = top); null until seeded
  notes      text,
  created_at timestamptz not null default now()
);
create index entries_event_idx on public.entries (event_id);

create table public.entry_players (
  entry_id  uuid not null references public.entries(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (entry_id, player_id)
);
create index entry_players_player_idx on public.entry_players (player_id);

-- ---------------------------------------------------------------- integrity

-- Enforced here: player and event in the same tournament; entry size ≤ discipline size
-- (1 singles / 2 doubles — completeness is a UI concern, over-filling is a DB concern);
-- one entry per player per event (ignoring withdrawn); gender rules. Gender is
-- structural: unambiguous violations are blocked, players with gender 'other' pass at
-- DB level — policy for them is a UI decision.
create or replace function public.enforce_entry_players()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_id    uuid;
  v_discipline  text;
  v_category    text;
  v_ev_tourn    uuid;
  v_pl_tourn    uuid;
  v_gender      text;
  v_count       int;
  v_males       int;
  v_females     int;
  v_cap         int;
begin
  select en.event_id, ev.discipline, ev.category, ev.tournament_id
    into v_event_id, v_discipline, v_category, v_ev_tourn
    from public.entries en
    join public.events ev on ev.id = en.event_id
   where en.id = new.entry_id;

  select p.tournament_id, p.gender
    into v_pl_tourn, v_gender
    from public.players p
   where p.id = new.player_id;

  if v_pl_tourn <> v_ev_tourn then
    raise exception 'player belongs to a different tournament than the event';
  end if;

  if v_category = 'mens' and v_gender = 'female' then
    raise exception 'a female player cannot be entered in a mens event';
  elsif v_category = 'womens' and v_gender = 'male' then
    raise exception 'a male player cannot be entered in a womens event';
  end if;

  -- one entry per player per event (withdrawn entries don't block a re-entry)
  if exists (
    select 1
      from public.entry_players ep
      join public.entries en2 on en2.id = ep.entry_id
     where ep.player_id = new.player_id
       and en2.event_id = v_event_id
       and ep.entry_id <> new.entry_id
       and en2.status <> 'withdrawn'
  ) then
    raise exception 'player already has an entry in this event';
  end if;

  -- size + pair-composition checks, counting the whole entry including this row
  select count(*),
         count(*) filter (where p.gender = 'male'),
         count(*) filter (where p.gender = 'female')
    into v_count, v_males, v_females
    from public.entry_players ep
    join public.players p on p.id = ep.player_id
   where ep.entry_id = new.entry_id;

  v_cap := case when v_discipline = 'singles' then 1 else 2 end;
  if v_count > v_cap then
    raise exception 'a % entry takes at most % player(s)', v_discipline, v_cap;
  end if;

  if v_category = 'mixed' then
    if v_males > 1 then
      raise exception 'a mixed pair cannot have two male players';
    end if;
    if v_females > 1 then
      raise exception 'a mixed pair cannot have two female players';
    end if;
  end if;

  return null;
end;
$$;

create trigger entry_players_integrity
after insert or update on public.entry_players
for each row execute function public.enforce_entry_players();

-- ---------------------------------------------------------------- RLS

alter table public.entries       enable row level security;
alter table public.entry_players enable row level security;

create policy "public read" on public.entries       for select using (true);
create policy "public read" on public.entry_players for select using (true);

create policy "admin write" on public.entries for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
create policy "admin write" on public.entry_players for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());
