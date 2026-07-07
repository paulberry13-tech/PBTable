// Supabase client for the booking app. Points at the PBTable platform (the same
// project that holds clubs / players / matches / social_sessions).
//
// Config comes from Expo public env vars so no secrets are committed:
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
// Set them in an .env file or app config. The ANON key is safe to ship — RLS
// (see the migrations) is what actually protects the data.
//
// PBTable Production ref: kxvtqsmjlhlajkoyejwk
//   URL:  https://kxvtqsmjlhlajkoyejwk.supabase.co
// Use the DEMO project (ezfpoyuebqjebxdcxyzy) while developing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!url || !anonKey) {
  // Not fatal — the app still runs on the mock seam (services/data.ts). This
  // only bites if you switch the seam to Supabase without configuring env.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not set — the Supabase data seam will not work until they are.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // On native, persist the session; on web the default (localStorage) is fine.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
