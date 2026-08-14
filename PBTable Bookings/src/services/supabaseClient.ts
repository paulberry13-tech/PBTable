// Supabase client for the booking app. Points at the PBTable platform (the same
// project that holds clubs / players / matches / social_sessions).
//
// Which project it points at is decided by the hostname at runtime (backend.ts):
// demo / netlify previews / localhost -> demo (ezfpoyuebqjebxdcxyzy), club
// subdomains -> production (kxvtqsmjlhlajkoyejwk). The ANON key is safe to ship —
// RLS (see the migrations) is what actually protects the data.

// Must be first: polyfills the global URL/URLSearchParams API that
// @supabase/supabase-js relies on but React Native's engine doesn't fully
// implement. Web already has URL, so this is a no-op there.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Backend comes from the hostname, not from build-time env — see backend.ts for
// why (one committed bundle has to serve demo and every club subdomain).
import { BACKEND } from './backend';

export const supabase = createClient(BACKEND.url, BACKEND.anonKey, {
  auth: {
    // On native, persist the session; on web the default (localStorage) is fine.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
