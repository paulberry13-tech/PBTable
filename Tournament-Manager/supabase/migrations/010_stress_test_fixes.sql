-- 010_stress_test_fixes.sql — Tournament Manager
-- Applied during the 3-tournament / 150+-player stress test (2026-08-12). Two schema-side
-- defects, both invisible at demo scale, both fixed and re-verified. See
-- docs/stress-test-report.md for how each was found.

-- ---------------------------------------------------------------------------------------
-- FIX #1 — admin writes to entry_players / entry_payments failed with 42501.
-- 005g revoked EXECUTE on recalc_entry_status() from the API roles (it takes an arbitrary
-- account id, so exposing it leaked ratings). But the AFTER triggers on entry_players and
-- entry_payments call it, and a trigger function runs with the *invoking* role's rights —
-- so a signed-in admin adding an entry, or pressing "Mark paid", hit the revoke and the
-- whole write rolled back. Player RPCs (SECURITY DEFINER) and service-role seeding were
-- unaffected, which is why it stayed hidden until the admin UI was driven as a real admin.
-- Fix: the trigger wrappers become SECURITY DEFINER. They cannot be called via the API
-- (trigger signatures aren't exposed as RPCs, and 013 revokes them anyway), so
-- recalc_entry_status stays unreachable from outside.
create or replace function public.entry_players_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;

create or replace function public.entry_payments_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- FIX #2 — a tournament (or event) that had reached the draw stage could not be deleted.
-- Deleting the parent cascades to entry_players, and guard_entry_players_after_draw() (005)
-- blocked that DELETE because a draw existed. So the admin "Danger zone → delete
-- tournament" and "delete event" buttons would fail on any real, drawn tournament, leaving
-- the organiser unable to remove it. The guard's job is only to stop a player being pulled
-- out of a LIVE entry — a cascade teardown is not that.
-- Fix: an explicit, transaction-scoped session flag that deliberate teardown paths set.
-- (Admins already bypass via is_tournament_admin(); this also covers the DB cascade and
-- the SECURITY DEFINER delete wrappers below.)
create or replace function public.guard_entry_players_after_draw()
returns trigger language plpgsql set search_path = '' as $$
declare v_entry uuid; v_event uuid; v_drawn int;
begin
  if public.is_tournament_admin() then return coalesce(new, old); end if;
  if coalesce(current_setting('app.bypass_draw_guard', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_entry := coalesce(new.entry_id, old.entry_id);
  select e.event_id into v_event from public.entries e where e.id = v_entry;
  if v_event is null then return old; end if;   -- parent gone => cascade teardown, allow
  select count(*) into v_drawn from public.matches m where m.event_id = v_event;
  if v_drawn > 0 then
    raise exception 'the draw for this event has been generated - withdraw the entry instead of changing its players';
  end if;
  return coalesce(new, old);
end;
$$;

-- Delete wrappers so the app can tear down a drawn event/tournament cleanly. The bypass is
-- transaction-local; the is_tournament_admin() check is the real gate.
create or replace function public.admin_delete_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tournament_admin() then raise exception 'not authorised'; end if;
  perform set_config('app.bypass_draw_guard', 'on', true);
  delete from public.tournaments where id = p_tournament;
end $$;

create or replace function public.admin_delete_event(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tournament_admin() then raise exception 'not authorised'; end if;
  perform set_config('app.bypass_draw_guard', 'on', true);
  delete from public.events where id = p_event;
end $$;

-- ---------------------------------------------------------------------------------------
-- Lock down the functions this migration made SECURITY DEFINER.
-- The recalc wrappers must never be reachable as RPCs; the delete wrappers gate on the
-- admin check internally but have no reason to be anon-callable.
revoke execute on function public.entry_players_recalc()  from public, anon, authenticated;
revoke execute on function public.entry_payments_recalc() from public, anon, authenticated;
revoke execute on function public.admin_delete_tournament(uuid) from public, anon;
revoke execute on function public.admin_delete_event(uuid)      from public, anon;
