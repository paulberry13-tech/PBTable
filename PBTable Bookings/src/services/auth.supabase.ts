// Supabase auth. Passwordless email OTP — members receive a 6-digit code, no
// password to set or remember. The "current user" is the booking_members row
// for the signed-in auth user. Session is persisted by the Supabase client
// (localStorage on web, AsyncStorage on native), so a reload keeps you signed in.

import { DEMO_EMAIL, DEMO_PASSWORD } from '@/services/config';
import { getBalance } from '@/services/data.supabase';
import { supabase } from '@/services/supabaseClient';
import { Member, Role } from '@/types';

let cachedMemberId = '';

/** Demo mode: sign in as the fixed demo member with a password (no OTP), so the
 *  demo booking app opens already signed in. Gated by DEMO_AUTOLOGIN at the call
 *  site; never wired on a real club build. */
export async function demoSignIn(): Promise<void> {
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error('Demo credentials not configured.');
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL.trim(),
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(error.message);
}

/** Passwordless step 1: email the member a 6-digit one-time code. Invite-only —
 *  `shouldCreateUser: false` means only members the club has already added can
 *  sign in (a stray email is rejected with "Signups not allowed for otp"). */
export async function sendOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(error.message);
}

/** Passwordless step 2: verify the emailed code and open a session.
 *
 *  Tries several token types, because which one is correct depends on how Supabase
 *  generated the email and we do not get told. `signInWithOtp` against an EXISTING
 *  user issues a magiclink-type token; a brand-new user (the join flow, which sets
 *  shouldCreateUser) issues a signup/email one. Verifying with the wrong type fails
 *  as "Token has expired or is invalid" -- which reads as a stale code and sends
 *  you round the resend loop forever, with a perfectly good code in your hand.
 *
 *  The dashboard has always done this (sbVerifyOtp loops the same way); the member
 *  app did not, and it went unnoticed because the demo app auto-signs-in and never
 *  exercises this path. On a real club it fails every time.
 *
 *  Order matters: magiclink first, because that is what an existing member always
 *  gets, so the common case costs one request. */
export async function verifyOtp(email: string, code: string): Promise<void> {
  const types = ['magiclink', 'email', 'signup', 'recovery'] as const;
  let lastError: Error | null = null;
  for (const type of types) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: type as never,
    });
    if (!error) return;
    lastError = new Error(error.message);
  }
  throw lastError ?? new Error('That code is invalid or has expired.');
}

/** Does the signed-in identity actually have a member record at this club?
 *  true / false / null, where null means "could not tell" — see the note below.
 *
 *  Signing in and being a member are separate, exactly as they are for admins on
 *  the dashboard. An address can hold a valid login -- a club admin, or someone
 *  who joined a different club -- and have no booking_members row here. Callers
 *  need to tell that apart from a bad code, because the two used to look
 *  identical: both simply redisplayed the sign-in form. */
export async function hasMemberRecord(): Promise<boolean | null> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('booking_members')
    .select('id')
    .eq('auth_user_id', uid)
    .is('revoked_at', null)
    .maybeSingle();
  // null = could not tell. Fails OPEN: the caller signs the person out on this
  // answer, so a network blip must never be allowed to read as "not a member" and
  // eject someone who is one. Only a clean query returning no row is definitive.
  if (error) return null;
  return !!data;
}

export async function signOut(): Promise<void> {
  cachedMemberId = '';
  await supabase.auth.signOut();
}

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function getCurrentUser(): Promise<Member> {
  // getSession reads the locally-stored session (no network round-trip), so it's
  // reliable immediately after signIn and during token refreshes.
  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user?.id;
  if (!uid) throw new Error('Not signed in.');

  // revoked_at set means an admin has taken this person's access away (migration
  // 49). The row survives so their history does, but it must not sign anyone in.
  const { data: bm, error } = await supabase
    .from('booking_members')
    .select('id,display_name,email')
    .eq('auth_user_id', uid)
    .is('revoked_at', null)
    .single();
  if (error) throw error;

  cachedMemberId = bm.id;
  const balancePence = await getBalance(bm.id);
  return {
    id: bm.id,
    name: bm.display_name ?? bm.email ?? 'Member',
    email: bm.email ?? '',
    memberType: 'member',
    ratingState: 'unrated',
    gradedGames: 0,
    balancePence,
  };
}

export function getCurrentUserId(): string {
  return cachedMemberId;
}

export async function getRole(): Promise<Role> {
  return 'member';
}

export async function setRole(role: Role): Promise<Role> {
  return role;
}

/** JOIN (self-signup) step 1. Unlike sendOtp, this ALLOWS the account to be
 *  created — that is the whole difference between "I am a member, let me in" and
 *  "I am new here". Nothing is written to the club's roster at this point: the
 *  auth user exists but belongs to no club until join_club() runs, so an
 *  abandoned signup leaves no junk behind. */
export async function sendJoinOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

/** JOIN step 3 (after the code is verified): create the players + booking_members
 *  rows. Deliberately AFTER verification — see migration 30. */
export async function joinClub(slug: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('join_club', { p_club_slug: slug, p_name: name.trim() });
  if (error) throw new Error(error.message);
}

/** Whether this club takes sign-ups, and what a newcomer would pay. Readable
 *  signed-out, so the join screen can say "this club isn't taking sign-ups"
 *  before anyone types an email. */
export async function clubSignupInfo(slug: string): Promise<{
  club_name: string; self_signup: boolean; free_taster_sessions: number; price_nonmember_pennies: number | null;
} | null> {
  const { data, error } = await supabase.rpc('club_signup_info', { p_club_slug: slug });
  if (error) return null;
  return (data ?? null) as never;
}
