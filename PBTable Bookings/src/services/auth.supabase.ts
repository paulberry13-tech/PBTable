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

/** Passwordless step 2: verify the emailed code and open a session. */
export async function verifyOtp(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
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

  const { data: bm, error } = await supabase
    .from('booking_members')
    .select('id,display_name,email')
    .eq('auth_user_id', uid)
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
