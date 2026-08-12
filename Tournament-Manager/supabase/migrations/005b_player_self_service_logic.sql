create or replace function public.age_for_tournament(p_dob date, p_start date)
returns integer language sql immutable set search_path = '' as $$
  select case when p_dob is null then null
    else extract(year from p_start)::int - extract(year from p_dob)::int end;
$$;

create or replace function public.account_rating(p_account uuid, p_source text)
returns numeric language sql stable set search_path = '' as $$
  select case
    when p_source ilike 'self' then coalesce(a.self_rating, a.dupr_rating)
    else coalesce(a.dupr_rating, a.self_rating)
  end
  from public.player_accounts a where a.user_id = p_account;
$$;

create or replace function public.registration_is_open(p_tournament uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(s.self_service_entries, false)
     and (t.registration_opens_at  is null or now() >= t.registration_opens_at)
     and (t.registration_closes_at is null or now() <= t.registration_closes_at)
  from public.tournaments t
  left join public.tournament_settings s on s.tournament_id = t.id
  where t.id = p_tournament;
$$;

create or replace function public.recalc_entry_status(p_entry uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_event uuid; v_disc text; v_cap smallint; v_fee int;
  v_needed int; v_have int; v_unpaid int; v_status text; v_entered int;
begin
  select e.status, e.event_id into v_status, v_event from public.entries e where e.id = p_entry;
  if v_status is null or v_status = 'withdrawn' then return; end if;

  select ev.discipline, ev.max_entries, ev.entry_fee_pence
    into v_disc, v_cap, v_fee from public.events ev where ev.id = v_event;

  v_needed := case when v_disc = 'singles' then 1 else 2 end;
  select count(*) into v_have from public.entry_players ep where ep.entry_id = p_entry;

  select count(*) into v_unpaid
    from public.entry_players ep
    left join public.entry_payments pay
      on pay.entry_id = ep.entry_id and pay.player_id = ep.player_id
   where ep.entry_id = p_entry and v_fee > 0
     and coalesce(pay.status, 'pending') not in ('paid','waived');

  if v_have < v_needed or v_unpaid > 0 then
    if v_status <> 'incomplete' then
      update public.entries set status = 'incomplete' where id = p_entry;
    end if;
    return;
  end if;

  if v_status = 'incomplete' then
    select count(*) into v_entered from public.entries e2
     where e2.event_id = v_event and e2.status = 'entered' and e2.id <> p_entry;
    if v_cap is not null and v_entered >= v_cap then
      update public.entries set status = 'waitlisted' where id = p_entry;
    else
      update public.entries set status = 'entered' where id = p_entry;
    end if;
  end if;
end;
$$;

create or replace function public.entry_players_recalc()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;
create trigger entry_players_status
after insert or delete on public.entry_players
for each row execute function public.entry_players_recalc();

create or replace function public.entry_payments_recalc()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;
create trigger entry_payments_status
after insert or update or delete on public.entry_payments
for each row execute function public.entry_payments_recalc();

create or replace function public.guard_player_self_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_tournament_admin() then return new; end if;
  if new.checked_in is distinct from old.checked_in then
    raise exception 'check-in is set by the organiser on the day, not by players';
  end if;
  if new.tournament_id is distinct from old.tournament_id
     or new.account_id is distinct from old.account_id then
    raise exception 'a player row cannot be moved between tournaments or accounts';
  end if;
  return new;
end;
$$;
create trigger players_self_update_guard
before update on public.players
for each row execute function public.guard_player_self_update();

create or replace function public.guard_entry_players_after_draw()
returns trigger language plpgsql set search_path = '' as $$
declare v_entry uuid; v_event uuid; v_drawn int;
begin
  if public.is_tournament_admin() then return coalesce(new, old); end if;
  v_entry := coalesce(new.entry_id, old.entry_id);
  select e.event_id into v_event from public.entries e where e.id = v_entry;
  select count(*) into v_drawn from public.matches m where m.event_id = v_event;
  if v_drawn > 0 then
    raise exception 'the draw for this event has been generated - withdraw the entry instead of changing its players';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger entry_players_draw_guard
before insert or delete on public.entry_players
for each row execute function public.guard_entry_players_after_draw();
