create or replace function public.respond_to_invitation(p_token text, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.entry_invitations; ev public.events; t_id uuid;
  my_email text; my_gender text; other_gender text;
  my_player uuid; v_problem text; v_fee int; v_curr text;
  my_rating numeric; other_rating numeric; other_acct uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into inv from public.entry_invitations where token = p_token;
  if inv.id is null then raise exception 'that invitation link is not valid'; end if;
  if inv.status <> 'pending' then raise exception 'that invitation has already been %', inv.status; end if;

  select lower(email), gender into my_email, my_gender
    from public.player_accounts where user_id = me;
  if my_email is null then raise exception 'complete your player profile first'; end if;
  if inv.invited_account is not null and inv.invited_account <> me then
    raise exception 'that invitation was sent to someone else';
  end if;
  if inv.invited_account is null and lower(inv.invited_email) <> my_email then
    raise exception 'that invitation was sent to %', inv.invited_email;
  end if;

  if not p_accept then
    update public.entry_invitations set status = 'declined', responded_at = now(), invited_account = me
     where id = inv.id;
    return inv.entry_id;
  end if;

  select ev2.* into ev from public.events ev2
    join public.entries en on en.event_id = ev2.id where en.id = inv.entry_id;
  t_id := ev.tournament_id;
  if not public.registration_is_open(t_id) then
    raise exception 'online entry has closed for this tournament';
  end if;

  v_problem := public.eligibility_problem(ev.id, me);
  if v_problem is not null then raise exception '%', v_problem; end if;

  select p.account_id into other_acct
    from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = inv.entry_id limit 1;
  select gender into other_gender from public.player_accounts where user_id = other_acct;
  if ev.category = 'mixed' and other_gender = my_gender then
    raise exception 'a mixed pair needs one man and one woman';
  end if;
  if ev.combined_rating_max is not null then
    my_rating    := public.account_rating(me, ev.seeding_rating_source);
    other_rating := public.account_rating(other_acct, ev.seeding_rating_source);
    if my_rating is null or other_rating is null
       or my_rating + other_rating > ev.combined_rating_max then
      raise exception 'this pair exceeds the event''s combined rating cap of %', ev.combined_rating_max;
    end if;
  end if;

  my_player := public.ensure_player(t_id, me);
  insert into public.entry_players (entry_id, player_id) values (inv.entry_id, my_player);

  v_fee := ev.entry_fee_pence;
  select currency into v_curr from public.tournaments where id = t_id;
  insert into public.entry_payments (entry_id, player_id, account_id, amount_pence, currency, status)
    values (inv.entry_id, my_player, me, v_fee, v_curr,
            case when v_fee = 0 then 'waived' else 'pending' end)
    on conflict (entry_id, player_id) do nothing;

  update public.entry_invitations set status = 'accepted', responded_at = now(), invited_account = me
   where id = inv.id;
  perform public.recalc_entry_status(inv.entry_id);
  return inv.entry_id;
end;
$$;

create or replace function public.change_partner(p_entry uuid, p_partner_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.events; t_id uuid; v_owner boolean;
  old_player uuid; new_acct uuid; new_gender text; my_gender text; v_prob text;
begin
  if me is null then raise exception 'sign in first'; end if;
  select ev2.* into ev from public.events ev2
    join public.entries en on en.event_id = ev2.id where en.id = p_entry;
  if ev.id is null then raise exception 'unknown entry'; end if;
  t_id := ev.tournament_id;

  select exists (
    select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
     where ep.entry_id = p_entry and p.account_id = me) into v_owner;
  if not v_owner then raise exception 'that is not your entry'; end if;

  if not public.registration_is_open(t_id) then
    raise exception 'online changes have closed - contact the organiser';
  end if;
  if exists (select 1 from public.matches m where m.event_id = ev.id) then
    raise exception 'the draw has been made - contact the organiser to change a partner';
  end if;

  select user_id, gender into new_acct, new_gender
    from public.player_accounts where lower(email) = lower(trim(p_partner_email));
  if new_acct = me then raise exception 'you cannot partner yourself'; end if;
  select gender into my_gender from public.player_accounts where user_id = me;
  if new_acct is not null then
    if ev.category = 'mixed' and new_gender = my_gender then
      raise exception 'a mixed pair needs one man and one woman'; end if;
    v_prob := public.eligibility_problem(ev.id, new_acct);
    if v_prob is not null then
      raise exception 'Your new partner cannot enter this event: %', v_prob; end if;
  end if;

  update public.entry_invitations set status = 'superseded', responded_at = now()
   where entry_id = p_entry and status = 'pending';

  select ep.player_id into old_player
    from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = p_entry and p.account_id is distinct from me limit 1;
  if old_player is not null then
    delete from public.entry_players where entry_id = p_entry and player_id = old_player;
    update public.entry_payments
       set status = case when status = 'paid' then 'refunded' else 'failed' end,
           refunded_at = case when status = 'paid' then now() else null end
     where entry_id = p_entry and player_id = old_player;
  end if;

  insert into public.entry_invitations (entry_id, invited_by, invited_email, invited_account)
    values (p_entry, me, lower(trim(p_partner_email)), new_acct);
  if new_acct is not null then perform public.ensure_player(t_id, new_acct); end if;

  perform public.recalc_entry_status(p_entry);
  return p_entry;
end;
$$;

create or replace function public.withdraw_my_entry(p_entry uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_event uuid; v_deadline timestamptz; v_owner boolean; v_refund boolean; v_cap smallint;
begin
  if me is null then raise exception 'sign in first'; end if;
  select exists (
    select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
     where ep.entry_id = p_entry and p.account_id = me) into v_owner;
  if not v_owner then raise exception 'that is not your entry'; end if;

  select ev.id, t.withdrawal_deadline, ev.max_entries into v_event, v_deadline, v_cap
    from public.entries en join public.events ev on ev.id = en.event_id
    join public.tournaments t on t.id = ev.tournament_id
   where en.id = p_entry;

  v_refund := v_deadline is null or now() <= v_deadline;

  update public.entries set status = 'withdrawn', withdrawn_at = now() where id = p_entry;
  update public.entry_invitations set status = 'cancelled', responded_at = now()
   where entry_id = p_entry and status = 'pending';
  if v_refund then
    update public.entry_payments set status = 'refunded', refunded_at = now()
     where entry_id = p_entry and status = 'paid';
  end if;

  if v_cap is not null then
    update public.entries set status = 'entered'
     where id = (select e2.id from public.entries e2
                  where e2.event_id = v_event and e2.status = 'waitlisted'
                  order by e2.created_at limit 1);
  end if;

  return case when v_refund then 'withdrawn_refunded' else 'withdrawn_no_refund' end;
end;
$$;

alter table public.player_accounts   enable row level security;
alter table public.entry_invitations enable row level security;
alter table public.entry_payments    enable row level security;

create policy "own account" on public.player_accounts for select using (user_id = auth.uid());
create policy "admin read"  on public.player_accounts for select using (public.is_tournament_admin());
create policy "own account update" on public.player_accounts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "mine" on public.entry_invitations for select
  using (invited_by = auth.uid() or invited_account = auth.uid() or public.is_tournament_admin());
create policy "admin write" on public.entry_invitations for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());

create policy "mine" on public.entry_payments for select
  using (account_id = auth.uid() or public.is_tournament_admin());
create policy "admin write" on public.entry_payments for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());

create policy "own player row" on public.players for update
  using (account_id = auth.uid()) with check (account_id = auth.uid());

create view public.my_entries with (security_invoker = on) as
select
  en.id as entry_id, en.status, en.seed, en.withdrawn_at,
  ev.id as event_id, ev.name as event_name, ev.discipline, ev.category,
  ev.band_label, ev.entry_fee_pence,
  t.id as tournament_id, t.name as tournament_name, t.start_date, t.venue,
  t.currency, t.withdrawal_deadline, t.registration_closes_at,
  (select count(*) from public.entry_players ep2 where ep2.entry_id = en.id) as roster,
  case when ev.discipline = 'singles' then 1 else 2 end as roster_needed,
  (select string_agg(p2.name, ' & ' order by p2.name)
     from public.entry_players ep3 join public.players p2 on p2.id = ep3.player_id
    where ep3.entry_id = en.id) as line_up,
  (select i.status from public.entry_invitations i
    where i.entry_id = en.id order by i.created_at desc limit 1) as invite_status,
  (select i.invited_email from public.entry_invitations i
    where i.entry_id = en.id order by i.created_at desc limit 1) as invited_email,
  (select pay.status from public.entry_payments pay
    where pay.entry_id = en.id and pay.account_id = auth.uid()) as my_payment_status,
  exists (select 1 from public.matches m where m.event_id = ev.id) as draw_made
from public.entries en
join public.events ev on ev.id = en.event_id
join public.tournaments t on t.id = ev.tournament_id
where exists (
  select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = en.id and p.account_id = auth.uid());

create view public.event_openings with (security_invoker = on) as
select ev.id as event_id, ev.tournament_id, ev.name, ev.discipline, ev.category,
       ev.band_label, ev.entry_fee_pence, ev.max_entries,
       ev.max_rating, ev.min_rating, ev.combined_rating_max, ev.min_age, ev.max_age,
       count(en.id) filter (where en.status = 'entered')    as entered,
       count(en.id) filter (where en.status = 'waitlisted') as waitlisted,
       count(en.id) filter (where en.status = 'incomplete') as incomplete,
       case when ev.max_entries is null then null
            else greatest(0, ev.max_entries - count(en.id) filter (where en.status = 'entered'))
       end as spaces_left
from public.events ev
left join public.entries en on en.event_id = ev.id
group by ev.id;
