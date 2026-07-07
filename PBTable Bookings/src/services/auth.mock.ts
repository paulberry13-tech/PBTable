// TODO: swap for Supabase Auth. Mock auth — a fixed current user plus an
// in-memory role that the UI role switcher toggles between Member and Admin.

import { getMember } from '@/services/data';
import { Member, Role } from '@/types';

const CURRENT_USER_ID = 'm-paul';

let currentRole: Role = 'member';

export async function getCurrentUser(): Promise<Member> {
  return getMember(CURRENT_USER_ID);
}

export function getCurrentUserId(): string {
  return CURRENT_USER_ID;
}

export async function getRole(): Promise<Role> {
  return currentRole;
}

export async function setRole(role: Role): Promise<Role> {
  currentRole = role;
  return currentRole;
}

// Auth-flow parity with the Supabase impl (the mock is always "signed in").
export async function hasSession(): Promise<boolean> {
  return true;
}
export async function signIn(_email: string, _password: string): Promise<void> {
  /* no-op */
}
export async function signOut(): Promise<void> {
  /* no-op */
}
