// Supabase client for the booking app. Points at the PBTable platform (the same
// project that holds clubs / players / matches / social_sessions).
//
// Which project it points at: on web, decided by the hostname at runtime
// (backend.ts) — demo / netlify previews / localhost -> demo
// (ezfpoyuebqjebxdcxyzy), club subdomains -> production (kxvtqsmjlhlajkoyejwk).
// On native it is production, fixed at build time. The ANON key is safe to ship —
// RLS (see the migrations) is what actually protects the data.

// Must be first: polyfills the global URL/URLSearchParams API that
// @supabase/supabase-js relies on but React Native's engine doesn't fully
// implement. Web already has URL, so this is a no-op there.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// The PROJECT comes from the hostname on web (one committed bundle has to serve
// demo and every club subdomain) and is a build constant on native. Either way it
// is fixed for the life of the process, which is what lets this client be a
// module-level constant — the CLUB varies underneath it, the project does not.
// See backend.ts.
import { PROJECT } from './backend';

export const supabase = createClient(PROJECT.url, PROJECT.anonKey, {
  auth: {
    // On native, persist the session; on web the default (localStorage) is fine.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
