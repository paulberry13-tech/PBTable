// Supabase auth. For the POC it auto-signs-in the seeded demo member so there's
// no login screen to build yet — a real sign-in flow replaces ensureSession().
// The "current user" is the booking_members row for the authenticated auth user.

import { getBalance } from '@/services/data.supabase';
import { supabase } from '@/services/supabaseClient';
import { Member, Role } from '@/types';

const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';

let cachedMemberId = '';

async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session && DEMO_EMAIL && DEMO_PASSWORD) {
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
  }
}

export async function getCurrentUser(): Promise<Member> {
  await ensureSession();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
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
  return 'member'; // admin is the existing web tooling; app is member-facing
}

export async function setRole(role: Role): Promise<Role> {
  return role; // no-op in Supabase mode
}
