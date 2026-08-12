-- Withdrawing ends the entry for BOTH players, which is right when a pair pulls out
-- together but wrong when only one of them drops. Leaving releases just you: your fee
-- becomes refundable, your partner keeps the entry and can invite someone else.
create or replace function public.leave_entry(p_entry uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  my_player uuid; v_event uuid; v_others int; v_deadline timestamptz; v_refund boolean;
begin
  if me is null then raise exception 'sign in first'; end if;

  select ep.player_id into my_player
    from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = p_entry and p.account_id = me;
  if my_player is null then raise exception 'that is not your entry'; end if;

  select ev.id, t.withdrawal_deadline into v_event, v_deadline
    from public.entries en join public.events ev on ev.id = en.event_id
    join public.tournaments t on t.id = ev.tournament_id
   where en.id = p_entry;

  if not public.registration_is_open((select tournament_id from public.events where id = v_event)) then
    raise exception 'online changes have closed - contact the organiser';
  end if;
  if exists (select 1 from public.matches m where m.event_id = v_event) then
    raise exception 'the draw has been made - contact the organiser';
  end if;

  select count(*) into v_others from public.entry_players where entry_id = p_entry
    and player_id <> my_player;
  if v_others = 0 then
    -- nobody left to hold the entry: this is a withdrawal
    return public.withdraw_my_entry(p_entry);
  end if;

  v_refund := v_deadline is null or now() <= v_deadline;
  delete from public.entry_players where entry_id = p_entry and player_id = my_player;
  update public.entry_payments
     set status = case when status = 'paid' and v_refund then 'refunded'
                       when status = 'paid' then 'paid' else 'failed' end,
         refunded_at = case when status = 'paid' and v_refund then now() else null end
   where entry_id = p_entry and player_id = my_player;

  perform public.recalc_entry_status(p_entry);
  return case when v_refund then 'left_refunded' else 'left_no_refund' end;
end;
$$;
