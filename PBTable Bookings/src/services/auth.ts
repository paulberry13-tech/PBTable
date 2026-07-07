// Auth seam — forwards to the mock or Supabase auth based on USE_SUPABASE.
import { USE_SUPABASE } from '@/services/config';
import * as mock from '@/services/auth.mock';
import * as supa from '@/services/auth.supabase';

const impl: typeof mock = USE_SUPABASE ? supa : mock;

export const getCurrentUser = impl.getCurrentUser;
export const getCurrentUserId = impl.getCurrentUserId;
export const getRole = impl.getRole;
export const setRole = impl.setRole;
export const hasSession = impl.hasSession;
export const signIn = impl.signIn;
export const signUp = impl.signUp;
export const signOut = impl.signOut;
