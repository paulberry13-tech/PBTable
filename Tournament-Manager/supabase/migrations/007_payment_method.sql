-- How fees are collected is the organiser's decision, not a constant baked into the
-- page. 'organiser' (cash, bank transfer, on the day) is the default because it is what
-- a club runs on before any Stripe account exists — and it keeps the OFF path real.
alter table public.tournaments
  add column payment_method text not null default 'organiser'
    check (payment_method in ('organiser','online')),
  add column payment_instructions text;

comment on column public.tournaments.payment_instructions is
  'Shown to players when payment_method = organiser: how to pay (bank transfer, on the day, etc).';

-- What a player owes, and has paid, for one tournament — one row per fee so the page can
-- show a breakdown, a total, and a history without assembling it client-side.
create or replace function public.my_fees(p_tournament uuid)
returns table (
  payment_id uuid, entry_id uuid, event_id uuid, event_name text,
  amount_pence integer, currency text, status text,
  paid_at timestamptz, refunded_at timestamptz,
  entry_status text, roster integer, roster_needed integer, line_up text)
language sql security definer set search_path = '' as $$
  select pay.id, en.id, ev.id, ev.name,
         pay.amount_pence, pay.currency, pay.status, pay.paid_at, pay.refunded_at,
         en.status,
         (select count(*)::int from public.entry_players ep2 where ep2.entry_id = en.id),
         case when ev.discipline = 'singles' then 1 else 2 end,
         (select string_agg(p2.name, ' & ' order by p2.name)
            from public.entry_players ep3 join public.players p2 on p2.id = ep3.player_id
           where ep3.entry_id = en.id)
  from public.entry_payments pay
  join public.entries en on en.id = pay.entry_id
  join public.events ev on ev.id = en.event_id
  where ev.tournament_id = p_tournament
    and pay.account_id = auth.uid()
    and auth.uid() is not null
  order by ev.display_order, ev.name;
$$;
