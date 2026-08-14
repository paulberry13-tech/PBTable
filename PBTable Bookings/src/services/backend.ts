// Which backend and which club this build is talking to, resolved at RUNTIME
// from the hostname. This mirrors the PB_BACKENDS object in the dashboard's
// site/index.html, deliberately: the two must agree about what a hostname means,
// or /app and the dashboard around it would show different clubs.
//
// Why runtime and not env: `npx expo export` INLINES process.env.EXPO_PUBLIC_*
// at build time, so an env-configured build is welded to one backend. The prod
// Netlify site has no build step — it serves whatever site/app/ is committed —
// so a build-time backend would mean one committed bundle per club. Reading the
// hostname instead lets a single committed bundle serve every club subdomain.
//
//   demo.pbtable.com / *.netlify.app / localhost -> demo project,  slug 'demo'
//   <slug>.pbtable.com                           -> prod project,  slug = subdomain
//
// The anon keys are safe to ship — RLS is what protects the data.

export type Backend = {
  url: string;
  anonKey: string;
  /** Club slug, used for the rdr_leaderboard RPC. Session/player reads scope by
   *  the signed-in member's club_id instead — see myClubId in data.supabase.ts. */
  slug: string;
  /** Demo sandbox. Gates auto-login and the Stripe test-mode top-up. */
  isDemo: boolean;
};

const DEMO = {
  url: 'https://ezfpoyuebqjebxdcxyzy.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZnBveXVlYnFqZWJ4ZGN4eXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDg5MzcsImV4cCI6MjA5NzE4NDkzN30.NQc-OMS2CAc7zoGqSR2G63-l4bpD23mqNUg26Z9e3RQ',
};

const PROD = {
  url: 'https://kxvtqsmjlhlajkoyejwk.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dnRxc21qbGhsYWprb3llandrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzUzNTMsImV4cCI6MjA5NzcxMTM1M30.4ENqn_3RFGf_7vMSIDepz5Cna-HczKgtVwjLlvb1u_A',
};

function resolve(): Backend {
  // Native (or SSR/prerender, where there is no window): fall back to env. Only
  // the web build is served per-hostname, so this path stays env-driven.
  const host =
    typeof window !== 'undefined' && window.location ? window.location.hostname.toLowerCase() : '';

  if (!host) {
    return {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL || DEMO.url,
      anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEMO.anonKey,
      slug: process.env.EXPO_PUBLIC_CLUB_SLUG || 'demo',
      isDemo: (process.env.EXPO_PUBLIC_CLUB_SLUG || 'demo') === 'demo',
    };
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  const isNetlifyPreview = host.endsWith('.netlify.app');
  const isDemoHost = host === 'demo.pbtable.com' || host.startsWith('demo.');

  if (isLocal || isNetlifyPreview || isDemoHost) {
    return { ...DEMO, slug: 'demo', isDemo: true };
  }

  // <slug>.pbtable.com — the subdomain IS the club, same rule the dashboard uses.
  // An apex or unrecognised host has no club to show; treat it as demo rather
  // than pointing a stranger at production with an empty slug.
  const parts = host.split('.');
  const slug = parts.length > 2 ? parts[0] : '';
  if (!slug || slug === 'www') return { ...DEMO, slug: 'demo', isDemo: true };

  return { ...PROD, slug, isDemo: false };
}

export const BACKEND: Backend = resolve();
