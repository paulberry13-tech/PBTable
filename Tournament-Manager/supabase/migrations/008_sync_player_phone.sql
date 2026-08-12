-- The player profile has always had an optional phone, but neither upsert_my_profile nor
-- ensure_player copied it onto the tournament-scoped players row — so the organiser, who
-- reads `players`, never saw the number the player typed in. Fix both, then backfill.

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
          p_date_of_birth, nullif(trim(coalesce(p_phone,'')), ''),
          p_dupr_id, p_dupr_rating, p_self_rating)
  on conflict (user_id) do update set
    full_name = excluded.full_name, gender = excluded.gender, email = excluded.email,
    date_of_birth = excluded.date_of_birth, phone = excluded.phone,
    dupr_id = excluded.dupr_id, dupr_rating = excluded.dupr_rating,
    self_rating = excluded.self_rating, updated_at = now()
  returning * into v_row;

  -- keep every tournament player row in step, phone included
  update public.players p
     set name = v_row.full_name, gender = v_row.gender,
         email = v_row.email, phone = v_row.phone,
         date_of_birth = v_row.date_of_birth
   where p.account_id = v_row.user_id;

  return v_row;
end;
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
  insert into public.players (tournament_id, name, gender, email, phone, account_id, date_of_birth)
  values (p_tournament, v_a.full_name, v_a.gender, v_a.email, v_a.phone, p_account, v_a.date_of_birth)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.ensure_player(uuid, uuid) from public, anon, authenticated;

-- backfill anything already entered under the old behaviour
update public.players p
   set phone = a.phone
  from public.player_accounts a
 where p.account_id = a.user_id
   and a.phone is not null
   and p.phone is distinct from a.phone;

select count(*) as players_with_phone from public.players where phone is not null;
