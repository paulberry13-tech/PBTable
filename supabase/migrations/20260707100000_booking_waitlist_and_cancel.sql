-- ============================================================================
-- Booking app — waitlist + cancellation + top-up
-- ============================================================================
-- Builds ON TOP of the existing Demo booking backend (booking_members,
-- credits_ledger, polymorphic bookings, book_spot/session_spots). Adds:
--   * a waitlist (book_spot waitlists when full; cancel promotes)
--   * cancel_booking with a PER-CLUB cancellation cutoff (default 24h; clubs
--     pick 1/2/3 days via clubs.settings->>'cancel_cutoff_hours' = 24/48/72)
--   * wallet_topup (service-role; called after Stripe confirms)
--
-- Target: the Demo project (or a branch once on Pro). NOT Production yet.
-- ============================================================================

-- ---- bookings: allow waitlist / attended states + ordering -----------------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('booked', 'waitlisted', 'cancelled', 'attended', 'no_show'));

alter table public.bookings add column if not exists waitlist_pos integer;

-- At most one LIVE (booked or waitlisted) booking per member per session.
create unique index if not exists bookings_one_live
  on public.bookings(session_kind, session_id, member_id)
  where status in ('booked', 'waitlisted');

-- ---- book_spot v2: waitlist when full --------------------------------------
create or replace function public.book_spot(p_session_kind text, p_session_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_club uuid; v_capacity int; v_price int; v_open boolean; v_mode text;
  v_booked int; v_wait int; v_balance int; v_shortfall int; v_booking_id uuid; v_member_club uuid;
begin
  select club_id into v_member_club from booking_members
    where id = p_member_id and auth_user_id = auth.uid();
  if v_member_club is null then raise exception 'not_your_member'; end if;

  if p_session_kind = 'social' then
    select club_id, capacity, price_pennies, booking_open into v_club, v_capacity, v_price, v_open
      from social_sessions where id = p_session_id for update;
  elsif p_session_kind = 'graded' then
    select club_id, capacity, price_pennies, booking_open into v_club, v_capacity, v_price, v_open
      from session_plans where id = p_session_id for update;
  else raise exception 'bad_session_kind'; end if;

  if v_club is null then raise exception 'session_not_found'; end if;
  if v_club <> v_member_club then raise exception 'wrong_club'; end if;
  if not coalesce(v_open, false) then raise exception 'booking_closed'; end if;

  if exists (select 1 from bookings
             where session_kind = p_session_kind and session_id = p_session_id
               and member_id = p_member_id and status in ('booked', 'waitlisted')) then
    raise exception 'already_booked';
  end if;

  v_price := coalesce(v_price, 0);
  select coalesce(settings->>'booking_mode', 'paid') into v_mode from clubs where id = v_club;

  select count(*) into v_booked from bookings
    where session_kind = p_session_kind and session_id = p_session_id and status in ('booked', 'attended');

  -- FULL → waitlist (no charge).
  if v_capacity is not null and v_booked >= v_capacity then
    select count(*) into v_wait from bookings
      where session_kind = p_session_kind and session_id = p_session_id and status = 'waitlisted';
    insert into bookings(club_id, session_kind, session_id, member_id, price_charged_pennies, status, waitlist_pos)
      values (v_club, p_session_kind, p_session_id, p_member_id, 0, 'waitlisted', v_wait + 1)
      returning id into v_booking_id;
    return jsonb_build_object('booking_id', v_booking_id, 'waitlisted', true, 'position', v_wait + 1);
  end if;

  -- Charge from the wallet if this is a paid club and the session costs money.
  if v_price > 0 and v_mode = 'paid' then
    select coalesce(sum(amount_pennies), 0) into v_balance from credits_ledger where member_id = p_member_id;
    if v_balance < v_price then
      v_shortfall := v_price - v_balance;
      raise exception 'insufficient_credit:%', v_shortfall;
    end if;
  end if;

  insert into bookings(club_id, session_kind, session_id, member_id, price_charged_pennies, status)
    values (v_club, p_session_kind, p_session_id, p_member_id, v_price, 'booked')
    returning id into v_booking_id;

  if v_price > 0 and v_mode = 'paid' then
    insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
      values (v_club, p_member_id, -v_price, 'booking', v_booking_id);
    v_balance := v_balance - v_price;
  else
    select coalesce(sum(amount_pennies), 0) into v_balance from credits_ledger where member_id = p_member_id;
  end if;

  return jsonb_build_object('booking_id', v_booking_id, 'waitlisted', false,
    'price_charged', v_price, 'new_balance', v_balance);
end; $$;

-- ---- cancel_booking: per-club cutoff + waitlist promotion + refund ----------
create or replace function public.cancel_booking(p_session_kind text, p_session_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_member_club uuid; v_club uuid; v_bk bookings;
  v_played date; v_start text; v_price int; v_cutoff_hours numeric; v_hours numeric;
  v_refund_now boolean; v_refund_due boolean; v_refund int := 0;
  v_promoted_id uuid; v_promoted_name text; v_promoted_wallet int;
  v_note text;
begin
  select club_id into v_member_club from booking_members
    where id = p_member_id and auth_user_id = auth.uid();
  if v_member_club is null then raise exception 'not_your_member'; end if;

  select * into v_bk from bookings
    where session_kind = p_session_kind and session_id = p_session_id
      and member_id = p_member_id and status in ('booked', 'waitlisted') limit 1;
  if v_bk.id is null then raise exception 'no_booking'; end if;
  v_club := v_bk.club_id;

  -- Waitlisted: just drop off, nothing charged.
  if v_bk.status = 'waitlisted' then
    update bookings set status = 'cancelled', waitlist_pos = null where id = v_bk.id;
    return jsonb_build_object('refunded', false, 'refund_pence', 0, 'note', 'Left the waitlist.');
  end if;

  if p_session_kind = 'social' then
    select played_on, start_time into v_played, v_start from social_sessions where id = p_session_id;
  else
    select played_on, start_time into v_played, v_start from session_plans where id = p_session_id;
  end if;

  -- Per-club cutoff (hours). Clubs choose 1/2/3 days → 24/48/72. Default 24.
  select coalesce((settings->>'cancel_cutoff_hours')::numeric, 24) into v_cutoff_hours from clubs where id = v_club;
  v_hours := extract(epoch from (
    ((v_played + coalesce(nullif(v_start, ''), '19:00')::time) at time zone 'Europe/London') - now())) / 3600.0;
  v_refund_now := coalesce(v_hours, 1e9) >= v_cutoff_hours;
  v_price := coalesce(v_bk.price_charged_pennies, 0);

  update bookings set status = 'cancelled' where id = v_bk.id;

  -- Promote the first waitlister who can afford the seat; charge them.
  for v_promoted_id, v_promoted_name, v_promoted_wallet in
    select b.member_id, coalesce(bm.display_name, pl.name, bm.email),
           (select coalesce(sum(amount_pennies), 0) from credits_ledger where member_id = b.member_id)
      from bookings b
      join booking_members bm on bm.id = b.member_id
      left join players pl on pl.id = bm.player_id
     where b.session_kind = p_session_kind and b.session_id = p_session_id and b.status = 'waitlisted'
     order by b.waitlist_pos asc
  loop
    if v_price = 0 or v_promoted_wallet >= v_price then
      update bookings set status = 'booked', waitlist_pos = null, price_charged_pennies = v_price
        where session_kind = p_session_kind and session_id = p_session_id
          and member_id = v_promoted_id and status = 'waitlisted';
      if v_price > 0 then
        insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
          values (v_club, v_promoted_id, -v_price, 'booking',
                  (select id from bookings where session_kind = p_session_kind and session_id = p_session_id
                     and member_id = v_promoted_id and status = 'booked' limit 1));
      end if;
      exit;
    end if;
    v_promoted_id := null; v_promoted_name := null; -- couldn't afford; try the next
  end loop;

  v_refund_due := v_refund_now or v_promoted_id is not null;
  if v_refund_due and v_price > 0 then
    v_refund := v_price;
    insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
      values (v_club, p_member_id, v_refund, 'refund', v_bk.id);
  end if;

  v_note := case
    when v_price = 0 then 'Free booking cancelled — spot released.'
    when v_refund_now then 'Cancelled before the cancellation cutoff — money returned to your balance.'
    when v_refund_due then 'Within the cutoff, but your spot was re-sold to the waitlist — money returned to your balance.'
    else 'Cancelled within the cancellation cutoff — no refund (no waitlister took the spot).'
  end;

  return jsonb_build_object('refunded', v_refund_due and v_price > 0, 'refund_pence', v_refund,
    'promoted_name', v_promoted_name, 'note', v_note);
end; $$;

-- ---- wallet_topup: credit the wallet after a confirmed Stripe payment -------
create or replace function public.wallet_topup(p_member uuid, p_amount int, p_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_club uuid; v_bal int;
begin
  if p_amount <= 0 then raise exception 'bad_amount'; end if;
  select club_id into v_club from booking_members where id = p_member;
  if v_club is null then raise exception 'no_member'; end if;
  insert into credits_ledger(club_id, member_id, amount_pennies, reason, stripe_checkout_session_id)
    values (v_club, p_member, p_amount, 'topup', p_ref);
  select coalesce(sum(amount_pennies), 0) into v_bal from credits_ledger where member_id = p_member;
  return jsonb_build_object('balance_pence', v_bal);
end; $$;

-- ---- grants -----------------------------------------------------------------
grant execute on function public.cancel_booking(text, uuid, uuid) to authenticated;
revoke all on function public.wallet_topup(uuid, int, text) from public, anon, authenticated;
grant execute on function public.wallet_topup(uuid, int, text) to service_role;
