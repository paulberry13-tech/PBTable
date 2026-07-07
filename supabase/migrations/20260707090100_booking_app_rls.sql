-- ============================================================================
-- PBTable Booking App — Row-Level Security
-- ============================================================================
-- The security model in one line: MEMBERS can READ what belongs to their club,
-- and every WRITE that touches money, capacity, or ratings goes through the
-- SECURITY DEFINER functions (see the _functions migration) — never a direct
-- client write. So the money/booking tables get SELECT policies only.
--
-- NOTE: this migration does not weaken any policy on the existing engine tables
-- (players, social_sessions). It ADDS read policies scoped to the member's club.
-- If those tables already have policies you rely on, review the additions below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (STABLE, security definer) — resolve the caller's identity.
-- ----------------------------------------------------------------------------

-- The player row for the currently-authenticated member (NULL if unlinked).
create or replace function app_current_player_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where user_id = auth.uid() limit 1;
$$;

-- The caller's club (a member's club, via their player row).
create or replace function app_current_club_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select club_id from players where user_id = auth.uid() limit 1;
$$;

-- Is the caller an admin of the given club?
create or replace function app_is_club_admin(p_club uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_admins
    where club_id = p_club and user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- players — members can see everyone in their own club (leaderboard, roster,
-- directory). No client writes: ratings are derived, wallet is server-managed.
-- ----------------------------------------------------------------------------
drop policy if exists players_select_same_club on players;
create policy players_select_same_club on players
  for select to authenticated
  using (club_id = app_current_club_id() or app_is_club_admin(club_id));

-- ----------------------------------------------------------------------------
-- social_sessions — members read their club's sessions; admins manage them.
-- ----------------------------------------------------------------------------
drop policy if exists sessions_select_same_club on social_sessions;
create policy sessions_select_same_club on social_sessions
  for select to authenticated
  using (club_id = app_current_club_id() or app_is_club_admin(club_id));

drop policy if exists sessions_admin_write on social_sessions;
create policy sessions_admin_write on social_sessions
  for all to authenticated
  using (app_is_club_admin(club_id))
  with check (app_is_club_admin(club_id));

-- ----------------------------------------------------------------------------
-- bookings — a member sees their own bookings and the roster of sessions in
-- their club; admins see all their club's bookings. WRITES go through the
-- book/cancel functions only (no INSERT/UPDATE/DELETE policy here).
-- ----------------------------------------------------------------------------
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select to authenticated
  using (
    player_id = app_current_player_id()
    or club_id = app_current_club_id()
    or app_is_club_admin(club_id)
  );

-- ----------------------------------------------------------------------------
-- wallet_ledger — a member sees only their OWN ledger; admins see their club's.
-- Writes go through the top-up / book / cancel functions only.
-- ----------------------------------------------------------------------------
drop policy if exists wallet_select_own on wallet_ledger;
create policy wallet_select_own on wallet_ledger
  for select to authenticated
  using (player_id = app_current_player_id() or app_is_club_admin(club_id));
