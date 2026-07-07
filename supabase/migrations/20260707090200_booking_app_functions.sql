-- ============================================================================
-- PBTable Booking App — server-authoritative functions (the trust boundary)
-- ============================================================================
-- Every money/capacity decision lives here, not on the client. These run as
-- SECURITY DEFINER (bypass RLS) with a pinned search_path, and act on the
-- caller's OWN player row (via auth.uid()) so a member can only book/cancel for
-- themselves. Top-up is service-role only (it runs AFTER Stripe confirms).
--
-- NOT here (they already exist in the engine, reuse them):
--   * RDR rating recalculation  → computed from `matches`
--   * balanced court slips       → social_sessions.plan (ability planner)
--   * entering scores            → writes `matches`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Book a session for the current member. Draws the price from the wallet; if
-- the session is full, joins the waitlist (no charge). Raises
-- INSUFFICIENT_BALANCE (with the shortfall in DETAIL) so the app can open top-up.
-- ----------------------------------------------------------------------------
create or replace function app_book_session(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid; v_club uuid; v_wallet int;
  v_price int; v_cap int; v_active int; v_wait int;
  v_booking_id uuid;
begin
  select id, club_id, wallet_pence into v_player, v_club, v_wallet
    from players where user_id = auth.uid() limit 1;
  if v_player is null then
    raise exception 'NO_MEMBER' using message = 'No member account is linked to this login.';
  end if;

  select price_pence, capacity, club_id into v_price, v_cap, v_club
    from social_sessions where id = p_session;
  if v_price is null then
    raise exception 'NO_SESSION' using message = 'Session not found.';
  end if;

  if exists (select 1 from bookings
             where session_id = p_session and player_id = v_player
               and status in ('booked', 'waitlisted')) then
    raise exception 'ALREADY_BOOKED' using message = 'You already have a booking for this session.';
  end if;

  select count(*) into v_active from bookings
    where session_id = p_session and status in ('booked', 'attended');

  -- Full → waitlist, no charge.
  if v_active >= coalesce(v_cap, 0) then
    select count(*) into v_wait from bookings
      where session_id = p_session and status = 'waitlisted';
    insert into bookings(club_id, session_id, player_id, status, paid_pence, waitlist_pos)
      values (v_club, p_session, v_player, 'waitlisted', 0, v_wait + 1)
      returning id into v_booking_id;
    return jsonb_build_object('waitlisted', true, 'position', v_wait + 1, 'booking_id', v_booking_id);
  end if;

  if v_price > 0 and v_wallet < v_price then
    raise exception 'INSUFFICIENT_BALANCE'
      using message = 'Not enough balance to book this session.',
            detail  = (v_price - v_wallet)::text;   -- shortfall in pence
  end if;

  insert into bookings(club_id, session_id, player_id, status, paid_pence)
    values (v_club, p_session, v_player, 'booked', v_price)
    returning id into v_booking_id;

  if v_price > 0 then
    update players set wallet_pence = wallet_pence - v_price
      where id = v_player returning wallet_pence into v_wallet;
    insert into wallet_ledger(club_id, player_id, kind, amount_pence, balance_after_pence, description, session_id)
      select v_club, v_player, 'spend', -v_price, v_wallet, coalesce(name, 'Session'), p_session
        from social_sessions where id = p_session;
  end if;

  return jsonb_build_object('waitlisted', false, 'booking_id', v_booking_id, 'paid_pence', v_price);
end;
$$;

-- ----------------------------------------------------------------------------
-- Cancel the current member's booking, applying THE 24-hour policy:
--   * > 24h before start        → full refund to wallet, promote first waitlister.
--   * within 24h                → no refund UNLESS a waitlister takes the seat
--                                 (then the seat was re-sold → refund).
-- Promotion charges the promoted member; anyone who can't afford it is skipped.
-- ----------------------------------------------------------------------------
create or replace function app_cancel_booking(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid; v_club uuid;
  v_bk bookings;
  v_hours numeric; v_price int; v_name text;
  v_refund_now boolean; v_refund_due boolean; v_refund int := 0; v_bal int;
  v_promoted_id uuid; v_promoted_name text; v_promoted_wallet int;
  v_note text;
begin
  select id, club_id into v_player, v_club from players where user_id = auth.uid() limit 1;
  if v_player is null then raise exception 'NO_MEMBER'; end if;

  select * into v_bk from bookings
    where session_id = p_session and player_id = v_player
      and status in ('booked', 'waitlisted') limit 1;
  if v_bk.id is null then raise exception 'NO_BOOKING' using message = 'No active booking found.'; end if;

  if v_bk.status = 'waitlisted' then
    update bookings set status = 'cancelled', waitlist_pos = null where id = v_bk.id;
    return jsonb_build_object('refunded', false, 'refund_pence', 0, 'note', 'Left the waitlist.');
  end if;

  select
    extract(epoch from (
      ((played_on + coalesce(nullif(start_time, ''), '19:00')::time) at time zone 'Europe/London') - now()
    )) / 3600.0,
    price_pence, name
    into v_hours, v_price, v_name
    from social_sessions where id = p_session;
  v_refund_now := coalesce(v_hours, 999) >= 24;

  update bookings set status = 'cancelled' where id = v_bk.id;

  -- Promote the first waitlister who can afford the seat.
  for v_promoted_id, v_promoted_name, v_promoted_wallet in
    select b.player_id, p.name, p.wallet_pence
      from bookings b join players p on p.id = b.player_id
      where b.session_id = p_session and b.status = 'waitlisted'
      order by b.waitlist_pos asc
  loop
    if v_price = 0 or v_promoted_wallet >= v_price then
      update bookings set status = 'booked', waitlist_pos = null
        where session_id = p_session and player_id = v_promoted_id;
      if v_price > 0 then
        update players set wallet_pence = wallet_pence - v_price
          where id = v_promoted_id returning wallet_pence into v_promoted_wallet;
        insert into wallet_ledger(club_id, player_id, kind, amount_pence, balance_after_pence, description, session_id)
          values (v_club, v_promoted_id, 'spend', -v_price, v_promoted_wallet,
                  coalesce(v_name, 'Session') || ' (from waitlist)', p_session);
      end if;
      exit;
    end if;
    v_promoted_id := null; v_promoted_name := null;  -- couldn't afford; try the next
  end loop;

  v_refund_due := v_refund_now or v_promoted_id is not null;
  if v_refund_due and v_bk.paid_pence > 0 then
    v_refund := v_bk.paid_pence;
    update players set wallet_pence = wallet_pence + v_refund
      where id = v_player returning wallet_pence into v_bal;
    update bookings set refunded_pence = v_refund where id = v_bk.id;
    insert into wallet_ledger(club_id, player_id, kind, amount_pence, balance_after_pence, description, session_id)
      values (v_club, v_player, 'refund', v_refund, v_bal, 'Refund · ' || coalesce(v_name, 'Session'), p_session);
  end if;

  v_note := case
    when v_bk.paid_pence = 0 then 'Free booking cancelled — spot released.'
    when v_refund_now then 'Cancelled more than 24 hours before start — money returned to your balance.'
    when v_refund_due then 'Within 24 hours, but your spot was re-sold to the waitlist — money returned to your balance.'
    else 'Cancelled within 24 hours of start — no refund (no waitlister took the spot).'
  end;

  return jsonb_build_object(
    'refunded', v_refund_due and v_bk.paid_pence > 0,
    'refund_pence', v_refund,
    'promoted_name', v_promoted_name,
    'note', v_note
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Credit a wallet after a CONFIRMED Stripe payment. Service-role only — this is
-- called by the top-up Edge Function / webhook once the charge succeeds, never
-- directly by the app (a member must not be able to credit their own balance).
-- ----------------------------------------------------------------------------
create or replace function app_wallet_topup(p_player uuid, p_amount int, p_payment_intent text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_club uuid; v_bal int;
begin
  if p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  select club_id into v_club from players where id = p_player;
  if v_club is null then raise exception 'NO_MEMBER'; end if;
  update players set wallet_pence = wallet_pence + p_amount
    where id = p_player returning wallet_pence into v_bal;
  insert into wallet_ledger(club_id, player_id, kind, amount_pence, balance_after_pence, description, stripe_payment_intent)
    values (v_club, p_player, 'deposit', p_amount, v_bal, 'Top-up', p_payment_intent);
  return jsonb_build_object('balance_pence', v_bal);
end;
$$;

-- ----------------------------------------------------------------------------
-- Execution grants. Members may book/cancel (they act on their own row);
-- top-up is service-role only.
-- ----------------------------------------------------------------------------
revoke all on function app_book_session(uuid)   from public, anon;
revoke all on function app_cancel_booking(uuid)  from public, anon;
revoke all on function app_wallet_topup(uuid, int, text) from public, anon, authenticated;
grant execute on function app_book_session(uuid)  to authenticated;
grant execute on function app_cancel_booking(uuid) to authenticated;
grant execute on function app_wallet_topup(uuid, int, text) to service_role;
