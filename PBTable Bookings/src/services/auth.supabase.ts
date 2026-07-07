// Supabase auth. Real email/password sign-in; the "current user" is the
// booking_members row for the signed-in auth user. Session is persisted by the
// Supabase client (localStorage on web, AsyncStorage on native), so a reload
// keeps you signed in.

import { getBalance } from '@/services/data.supabase';
import { supabase } from '@/services/supabaseClient';
import { Member, Role } from '@/types';

let cachedMemberId = '';

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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
  return 'member';
}

export async function setRole(role: Role): Promise<Role> {
  return role;
}
