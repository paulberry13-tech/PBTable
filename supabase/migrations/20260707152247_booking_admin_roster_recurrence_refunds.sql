-- PBTable Bookings — admin roster bridge, recurring sessions, and admin refunds.
--
-- Ties the paid-booking loop to the ability planner and gives club admins the
-- session-management verbs they need:
--   * session_roster       — resolve paid attendees of a session (social OR graded)
--                            to their linked player + live RDR rating, ready to
--                            feed the balanced-court-slip generator.
--   * admin_create_session — create one session, or a weekly recurring series
--                            (same weekday/time), for social or graded sessions.
--   * admin_cancel_session — cancel a session and refund every booked attendee
--                            back to their wallet.
--   * admin_remove_booking — remove a single player from a session, refund them,
--                            and promote the first affordable waitlister.
--
-- All admin verbs are gated by private.is_club_admin(club) and granted to
-- authenticated. Money (credits_ledger, pennies) is the single source of truth;
-- there is no separate credit currency. Applies to the Demo project only.

-- 1. Recurrence + naming columns -------------------------------------------------
alter table social_sessions add column if not exists name text;
alter table social_sessions add column if not exists format text;
alter table social_sessions add column if not exists recurrence text not null default 'none';
alter table social_sessions add column if not exists series_id uuid;

alter table session_plans add column if not exists name text;
alter table session_plans add column if not exists format text;
alter table session_plans add column if not exists recurrence text not null default 'none';
alter table session_plans add column if not exists series_id uuid;

create index if not exists social_sessions_series_idx on social_sessions(series_id);
create index if not exists session_plans_series_idx on session_plans(series_id);

-- 2. session_roster --------------------------------------------------------------
-- Returns paid attendees resolved to player + live RDR rating. slip_rating falls
-- back to the club default (clubs.settings->>'default_rating', else 3.0) for
-- unrated players so the planner always has a number to balance on. Sorted by
-- rating descending. rating/slip_rating are double precision to match
-- rdr_leaderboard's return type.
drop function if exists public.session_roster(text, uuid);
create function public.session_roster(p_session_kind text, p_session_id uuid)
returns table (
  booking_id uuid, member_id uuid, player_id uuid, name text,
  rating double precision, slip_rating double precision, status text
)
language plpgsql security definer set search_path = public as $$
declare v_club uuid; v_slug text; v_default double precision;
begin
  if p_session_kind = 'social' then select club_id into v_club from social_sessions where id = p_session_id;
  elsif p_session_kind = 'graded' then select club_id into v_club from session_plans where id = p_session_id;
  else raise exception 'bad_session_kind'; end if;
  if v_club is null then raise exception 'session_not_found'; end if;
  if not private.is_club_admin(v_club) then raise exception 'not_admin'; end if;

  select slug into v_slug from clubs where id = v_club;
  select coalesce((settings->>'default_rating')::double precision, 3.0) into v_default from clubs where id = v_club;

  return query
  with lb as (select l.name, l.rating from public.rdr_leaderboard(v_slug) l)
  select b.id, b.member_id, bm.player_id,
         coalesce(bm.display_name, pl.name, bm.email) as name,
         lb.rating,
         coalesce(lb.rating, v_default) as slip_rating,
         b.status
    from bookings b
    join booking_members bm on bm.id = b.member_id
    left join players pl on pl.id = bm.player_id
    left join lb on lb.name = pl.name
   where b.session_kind = p_session_kind and b.session_id = p_session_id
     and b.status in ('booked', 'attended')
   order by coalesce(lb.rating, v_default) desc;
end $$;
grant execute on function public.session_roster(text, uuid) to authenticated;

-- 3. admin_create_session --------------------------------------------------------
-- Creates a single session, or (recurrence = 'weekly') a series of p_weeks weekly
-- instances on the same weekday/time, tagged with a shared series_id. Works for
-- social and graded (session_plans) sessions.
create or replace function public.admin_create_session(
  p_session_kind text, p_name text, p_played_on date, p_start text, p_end text,
  p_capacity integer, p_price_pennies integer, p_courts integer default 3,
  p_format text default 'round_robin', p_recurrence text default 'none', p_weeks integer default 8)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_club uuid; v_series uuid; v_ids uuid[] := '{}'; v_id uuid; v_n int; i int; v_date date;
begin
  select club_id into v_club from club_admins where user_id = auth.uid() limit 1;
  if v_club is null or not private.is_club_admin(v_club) then raise exception 'not_admin'; end if;
  if p_session_kind not in ('social', 'graded') then raise exception 'bad_session_kind'; end if;

  v_n := case when p_recurrence = 'weekly' then greatest(1, coalesce(p_weeks, 8)) else 1 end;
  if v_n > 1 then v_series := gen_random_uuid(); end if;

  for i in 0 .. (v_n - 1) loop
    v_date := p_played_on + (i * 7);
    if p_session_kind = 'social' then
      insert into social_sessions(club_id, played_on, name, format, capacity, price_pennies,
                                  booking_open, start_time, end_time, status, published, recurrence, series_id)
      values (v_club, v_date, p_name, coalesce(p_format, 'round_robin'), p_capacity, p_price_pennies,
              true, p_start, p_end, 'planned', true, p_recurrence, v_series)
      returning id into v_id;
    else
      insert into session_plans(club_id, played_on, name, format, courts, capacity, price_pennies,
                                booking_open, start_time, end_time, status, published, recurrence, series_id, plan)
      values (v_club, v_date, p_name, coalesce(p_format, 'round_robin'), coalesce(p_courts, 3), p_capacity, p_price_pennies,
              true, p_start, p_end, 'planned', true, p_recurrence, v_series, '{}'::jsonb)
      returning id into v_id;
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return jsonb_build_object('series_id', v_series, 'session_ids', to_jsonb(v_ids), 'count', v_n);
end $$;
grant execute on function public.admin_create_session(text, text, date, text, text, integer, integer, integer, text, text, integer) to authenticated;

-- 4. admin_cancel_session --------------------------------------------------------
-- Cancels a session and refunds every booked attendee their paid fee to wallet.
create or replace function public.admin_cancel_session(p_session_kind text, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_club uuid; v_refunded int := 0; v_count int := 0; r record;
begin
  if p_session_kind = 'social' then select club_id into v_club from social_sessions where id = p_session_id;
  elsif p_session_kind = 'graded' then select club_id into v_club from session_plans where id = p_session_id;
  else raise exception 'bad_session_kind'; end if;
  if v_club is null then raise exception 'session_not_found'; end if;
  if not private.is_club_admin(v_club) then raise exception 'not_admin'; end if;

  for r in select id, member_id, price_charged_pennies from bookings
           where session_kind = p_session_kind and session_id = p_session_id and status = 'booked'
  loop
    if coalesce(r.price_charged_pennies, 0) > 0 then
      insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
        values (v_club, r.member_id, r.price_charged_pennies, 'refund', r.id);
      v_refunded := v_refunded + r.price_charged_pennies;
    end if;
    v_count := v_count + 1;
  end loop;

  update bookings set status = 'cancelled', cancelled_at = now(), waitlist_pos = null
    where session_kind = p_session_kind and session_id = p_session_id and status in ('booked', 'waitlisted');

  if p_session_kind = 'social' then update social_sessions set status = 'cancelled', booking_open = false where id = p_session_id;
  else update session_plans set status = 'cancelled', booking_open = false where id = p_session_id; end if;

  return jsonb_build_object('cancelled', true, 'attendees_refunded', v_count, 'total_refund_pennies', v_refunded);
end $$;
grant execute on function public.admin_cancel_session(text, uuid) to authenticated;

-- 5. admin_remove_booking --------------------------------------------------------
-- Removes one player from a session, refunds them (if they were booked & paid),
-- and promotes the first waitlister who can afford the fee (charging their wallet).
create or replace function public.admin_remove_booking(p_session_kind text, p_session_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_club uuid; v_price int; v_bk bookings; v_refund int := 0;
        v_promoted_id uuid; v_promoted_name text; v_promoted_bal int;
begin
  if p_session_kind = 'social' then select club_id, price_pennies into v_club, v_price from social_sessions where id = p_session_id;
  elsif p_session_kind = 'graded' then select club_id, price_pennies into v_club, v_price from session_plans where id = p_session_id;
  else raise exception 'bad_session_kind'; end if;
  if v_club is null then raise exception 'session_not_found'; end if;
  if not private.is_club_admin(v_club) then raise exception 'not_admin'; end if;

  select * into v_bk from bookings where session_kind = p_session_kind and session_id = p_session_id
     and member_id = p_member_id and status in ('booked', 'waitlisted') limit 1;
  if v_bk.id is null then raise exception 'no_booking'; end if;

  update bookings set status = 'cancelled', cancelled_at = now(), waitlist_pos = null where id = v_bk.id;

  if v_bk.status = 'booked' and coalesce(v_bk.price_charged_pennies, 0) > 0 then
    v_refund := v_bk.price_charged_pennies;
    insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
      values (v_club, p_member_id, v_refund, 'refund', v_bk.id);
  end if;

  if v_bk.status = 'booked' then
    for v_promoted_id, v_promoted_name, v_promoted_bal in
      select b.member_id, coalesce(bm.display_name, pl.name),
             (select coalesce(sum(amount_pennies), 0) from credits_ledger where member_id = b.member_id)
        from bookings b join booking_members bm on bm.id = b.member_id left join players pl on pl.id = bm.player_id
       where b.session_kind = p_session_kind and b.session_id = p_session_id and b.status = 'waitlisted'
       order by b.waitlist_pos asc
    loop
      if coalesce(v_price, 0) = 0 or v_promoted_bal >= v_price then
        update bookings set status = 'booked', waitlist_pos = null, price_charged_pennies = coalesce(v_price, 0)
          where session_kind = p_session_kind and session_id = p_session_id and member_id = v_promoted_id and status = 'waitlisted';
        if coalesce(v_price, 0) > 0 then
          insert into credits_ledger(club_id, member_id, amount_pennies, reason, booking_id)
            values (v_club, v_promoted_id, -v_price, 'booking',
                    (select id from bookings where session_kind = p_session_kind and session_id = p_session_id and member_id = v_promoted_id and status = 'booked' limit 1));
        end if;
        exit;
      end if;
      v_promoted_id := null; v_promoted_name := null;
    end loop;
  end if;

  return jsonb_build_object('removed', true, 'refund_pennies', v_refund, 'promoted_name', v_promoted_name);
end $$;
grant execute on function public.admin_remove_booking(text, uuid, uuid) to authenticated;
