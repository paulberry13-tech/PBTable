-- Invitations addressed to me — matched on account OR on my email, because a partner
-- can be invited before they have ever signed up.
create or replace function public.my_invitations()
returns table (
  token text, entry_id uuid, event_id uuid, event_name text, discipline text,
  category text, band_label text, entry_fee_pence integer,
  tournament_id uuid, tournament_name text, start_date date, venue text, currency text,
  invited_by_name text, created_at timestamptz, problem text)
language sql security definer set search_path = '' as $$
  select i.token, i.entry_id, ev.id, ev.name, ev.discipline, ev.category, ev.band_label,
         ev.entry_fee_pence, t.id, t.name, t.start_date, t.venue, t.currency,
         inviter.full_name, i.created_at,
         public.eligibility_problem(ev.id, auth.uid())
  from public.entry_invitations i
  join public.entries en on en.id = i.entry_id
  join public.events ev on ev.id = en.event_id
  join public.tournaments t on t.id = ev.tournament_id
  join public.player_accounts inviter on inviter.user_id = i.invited_by
  where i.status = 'pending'
    and auth.uid() is not null
    and (i.invited_account = auth.uid()
         or lower(i.invited_email) = (select lower(email) from public.player_accounts where user_id = auth.uid()))
  order by i.created_at desc;
$$;

-- Every event in a tournament with my eligibility resolved in one round trip.
create or replace function public.my_event_options(p_tournament uuid)
returns table (
  event_id uuid, name text, discipline text, category text, band_label text,
  entry_fee_pence integer, max_rating numeric, min_rating numeric,
  combined_rating_max numeric, min_age smallint, max_age smallint,
  entered bigint, waitlisted bigint, spaces_left integer,
  registration_open boolean, problem text)
language sql security definer set search_path = '' as $$
  select o.event_id, o.name, o.discipline, o.category, o.band_label,
         o.entry_fee_pence, o.max_rating, o.min_rating, o.combined_rating_max,
         o.min_age, o.max_age, o.entered, o.waitlisted, o.spaces_left,
         public.registration_is_open(p_tournament),
         case when auth.uid() is null then 'Sign in to enter.'
              else public.eligibility_problem(o.event_id, auth.uid()) end
  from public.event_openings o
  join public.events ev on ev.id = o.event_id
  where o.tournament_id = p_tournament
  order by ev.display_order, ev.name;
$$;

-- Cancel a pending invitation I sent (without swapping in a new partner).
create or replace function public.cancel_my_invitation(p_entry uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first'; end if;
  if not exists (
    select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
     where ep.entry_id = p_entry and p.account_id = me) then
    raise exception 'that is not your entry';
  end if;
  update public.entry_invitations set status = 'cancelled', responded_at = now()
   where entry_id = p_entry and status = 'pending';
end;
$$;
