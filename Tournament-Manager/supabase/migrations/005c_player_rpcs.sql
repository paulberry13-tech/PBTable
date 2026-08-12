create or replace function public.upsert_my_profile(
  p_full_name text, p_gender text, p_email text,
  p_date_of_birth date default null, p_phone text default null,
  p_dupr_id text default null, p_dupr_rating numeric default null,
  p_self_rating numeric default null)
returns public.player_accounts
language plpgsql security definer set search_path = '' as $$
declare v_row public.player_accounts;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.player_accounts as a
    (user_id, full_name, gender, email, date_of_birth, phone, dupr_id, dupr_rating, self_rating)
  values (auth.uid(), trim(p_full_name), p_gender, lower(trim(p_email)),
          p_date_of_birth, p_phone, p_dupr_id, p_dupr_rating, p_self_rating)
  on conflict (user_id) do update set
    full_name = excluded.full_name, gender = excluded.gender, email = excluded.email,
    date_of_birth = excluded.date_of_birth, phone = excluded.phone,
    dupr_id = excluded.dupr_id, dupr_rating = excluded.dupr_rating,
    self_rating = excluded.self_rating, updated_at = now()
  returning * into v_row;

  update public.players p
     set name = v_row.full_name, gender = v_row.gender,
         email = v_row.email, date_of_birth = v_row.date_of_birth
   where p.account_id = v_row.user_id;

  return v_row;
end;
$$;

create or replace function public.find_partner(p_email text)
returns table (user_id uuid, full_name text, gender text)
language sql security definer set search_path = '' as $$
  select a.user_id, a.full_name, a.gender
  from public.player_accounts a
  where lower(a.email) = lower(trim(p_email))
    and auth.uid() is not null and a.user_id <> auth.uid();
$$;

create or replace function public.ensure_player(p_tournament uuid, p_account uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_a public.player_accounts;
begin
  select * into v_a from public.player_accounts where user_id = p_account;
  if v_a.user_id is null then raise exception 'no player profile for that account'; end if;
  select id into v_id from public.players
   where tournament_id = p_tournament and account_id = p_account;
  if v_id is not null then return v_id; end if;
  insert into public.players (tournament_id, name, gender, email, account_id, date_of_birth)
  values (p_tournament, v_a.full_name, v_a.gender, v_a.email, p_account, v_a.date_of_birth)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.eligibility_problem(p_event uuid, p_account uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.events; t public.tournaments; a public.player_accounts;
  v_rating numeric; v_age int;
begin
  select * into ev from public.events where id = p_event;
  select * into t from public.tournaments where id = ev.tournament_id;
  select * into a from public.player_accounts where user_id = p_account;
  if a.user_id is null then return 'Complete your player profile first.'; end if;

  if ev.category = 'mens'   and a.gender = 'female' then return 'This is a men''s event.'; end if;
  if ev.category = 'womens' and a.gender = 'male'   then return 'This is a women''s event.'; end if;

  v_rating := public.account_rating(p_account, ev.seeding_rating_source);
  if ev.max_rating is not null then
    if v_rating is null then
      return 'This event has a ' || ev.max_rating || ' rating ceiling - add your rating to your profile.';
    end if;
    if v_rating > ev.max_rating then
      return 'Your rating (' || v_rating || ') is above this event''s ' || ev.max_rating
             || ' ceiling. You may play up a band, never down.';
    end if;
  end if;

  v_age := public.age_for_tournament(a.date_of_birth, t.start_date);
  if ev.min_age is not null then
    if v_age is null then return 'This is an age-banded event - add your date of birth to your profile.'; end if;
    if v_age < ev.min_age then
      return 'This event is for players aged ' || ev.min_age || '+ (age as of 31 Dec ' ||
             extract(year from t.start_date)::int || ').';
    end if;
  end if;
  if ev.max_age is not null and v_age is not null and v_age > ev.max_age then
    return 'This event is for players aged ' || ev.max_age || ' and under.';
  end if;

  if exists (
    select 1 from public.entries en
    join public.entry_players ep on ep.entry_id = en.id
    join public.players p on p.id = ep.player_id
    where en.event_id = p_event and p.account_id = p_account and en.status <> 'withdrawn'
  ) then return 'You already have an entry in this event.'; end if;

  return null;
end;
$$;

create or replace function public.register_for_event(p_event uuid, p_partner_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.events; t_id uuid; v_fee int; v_curr text;
  my_player uuid; v_entry uuid; v_problem text;
  partner_acct uuid; partner_gender text; my_gender text;
  my_rating numeric; partner_rating numeric;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'unknown event'; end if;
  t_id := ev.tournament_id;

  if not public.registration_is_open(t_id) then
    raise exception 'online entry is not open for this tournament';
  end if;

  v_problem := public.eligibility_problem(p_event, me);
  if v_problem is not null then raise exception '%', v_problem; end if;

  if ev.discipline = 'singles' and p_partner_email is not null then
    raise exception 'singles events do not take a partner';
  end if;

  select gender into my_gender from public.player_accounts where user_id = me;

  if p_partner_email is not null then
    select user_id, gender into partner_acct, partner_gender
      from public.player_accounts where lower(email) = lower(trim(p_partner_email));
    if partner_acct is not null then
      if partner_acct = me then raise exception 'you cannot partner yourself'; end if;
      v_problem := public.eligibility_problem(p_event, partner_acct);
      if v_problem is not null then
        raise exception 'Your partner cannot enter this event: %', v_problem; end if;
      if ev.category = 'mixed' and partner_gender = my_gender then
        raise exception 'a mixed pair needs one man and one woman';
      end if;
      if ev.combined_rating_max is not null then
        my_rating      := public.account_rating(me, ev.seeding_rating_source);
        partner_rating := public.account_rating(partner_acct, ev.seeding_rating_source);
        if my_rating is null or partner_rating is null then
          raise exception 'this event caps combined rating at % - both players need a rating on file', ev.combined_rating_max;
        end if;
        if my_rating + partner_rating > ev.combined_rating_max then
          raise exception 'combined rating % exceeds this event''s cap of %',
            my_rating + partner_rating, ev.combined_rating_max;
        end if;
      end if;
    end if;
  elsif ev.discipline = 'doubles' then
    if not coalesce((select allow_partner_tbc from public.tournament_settings where tournament_id = t_id), true) then
      raise exception 'this tournament requires you to name your partner when you enter';
    end if;
  end if;

  my_player := public.ensure_player(t_id, me);
  insert into public.entries (event_id, status, created_by_account)
    values (p_event, 'incomplete', me) returning id into v_entry;
  insert into public.entry_players (entry_id, player_id) values (v_entry, my_player);

  v_fee := ev.entry_fee_pence;
  select currency into v_curr from public.tournaments where id = t_id;
  insert into public.entry_payments (entry_id, player_id, account_id, amount_pence, currency, status)
    values (v_entry, my_player, me, v_fee, v_curr,
            case when v_fee = 0 then 'waived' else 'pending' end);

  if p_partner_email is not null then
    insert into public.entry_invitations (entry_id, invited_by, invited_email, invited_account)
      values (v_entry, me, lower(trim(p_partner_email)), partner_acct);
    if partner_acct is not null then perform public.ensure_player(t_id, partner_acct); end if;
  end if;

  perform public.recalc_entry_status(v_entry);
  return v_entry;
end;
$$;
