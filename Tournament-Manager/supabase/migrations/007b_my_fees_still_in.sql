-- A refunded fee belongs to an entry the player may no longer be part of (swapped out,
-- or they left the pairing). Showing that entry's CURRENT line-up next to their refund
-- reads as though they are still in it, so return whether they are.
-- Adding an OUT column changes the return type, hence the drop.
drop function if exists public.my_fees(uuid);

create function public.my_fees(p_tournament uuid)
returns table (
  payment_id uuid, entry_id uuid, event_id uuid, event_name text,
  amount_pence integer, currency text, status text,
  paid_at timestamptz, refunded_at timestamptz,
  entry_status text, roster integer, roster_needed integer, line_up text,
  still_in boolean)
language sql security definer set search_path = '' as $$
  select pay.id, en.id, ev.id, ev.name,
         pay.amount_pence, pay.currency, pay.status, pay.paid_at, pay.refunded_at,
         en.status,
         (select count(*)::int from public.entry_players ep2 where ep2.entry_id = en.id),
         case when ev.discipline = 'singles' then 1 else 2 end,
         (select string_agg(p2.name, ' & ' order by p2.name)
            from public.entry_players ep3 join public.players p2 on p2.id = ep3.player_id
           where ep3.entry_id = en.id),
         exists (select 1 from public.entry_players ep4
                 join public.players p4 on p4.id = ep4.player_id
                 where ep4.entry_id = en.id and p4.account_id = auth.uid())
  from public.entry_payments pay
  join public.entries en on en.id = pay.entry_id
  join public.events ev on ev.id = en.event_id
  where ev.tournament_id = p_tournament
    and pay.account_id = auth.uid()
    and auth.uid() is not null
  order by ev.display_order, ev.name;
$$;
