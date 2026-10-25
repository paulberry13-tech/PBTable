// WHICH BACKEND, and WHICH CLUB. Two questions the hostname used to answer at
// once; native has no hostname, so they are now answered separately. See
// docs/DECISION-01-CLUB-RESOLUTION.md.
//
//   THE PROJECT (url + anon key) is fixed for the life of the process.
//     web    — from the hostname, exactly as before. This mirrors the PB_BACKENDS
//              object in the dashboard's site/index.html, deliberately: the two
//              must agree about what a hostname means, or /app and the dashboard
//              around it would show different clubs.
//     native — a BUILD CONSTANT, defaulting to production. A store binary must
//              never be able to fall through to the demo sandbox because an env
//              var was missing, which is what the old fallback did.
//
//   THE CLUB (slug) is runtime state.
//     web    — the subdomain, known before the first render.
//     native — chosen from a picker on first launch and persisted; see
//              clubStore.ts. Null until that has happened.
//
// Why the project is not runtime state too: every real club lives in the ONE
// production project, so the Supabase client can stay a module-level constant.
// That is what keeps this a seven-call-site change rather than a rewrite of the
// data layer.
//
// Why web stays runtime and not env: `npx expo export` INLINES
// process.env.EXPO_PUBLIC_* at build time, so an env-configured build is welded
// to one backend. The prod Netlify site has no build step — it serves whatever
// site/app/ is committed — so a build-time backend would mean one committed
// bundle per club. Reading the hostname instead lets a single committed bundle
// serve every club subdomain.
//
//   demo.pbtable.com / *.netlify.app / localhost -> demo project,  slug 'demo'
//   <slug>.pbtable.com                           -> prod project,  slug = subdomain
//
// The anon keys are safe to ship — RLS is what protects the data.

import { Platform } from 'react-native';

export type Project = {
  url: string;
  anonKey: string;
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

/** The hostname, lowercased — or '' when there is none (native, and SSR/prerender
 *  of the web build).
 *
 *  The Platform check is NOT redundant, and leaving it out is a live trap: React
 *  Native defines BOTH `window` and `window.location` under a Metro dev server, and
 *  `window.location.hostname` is then the DEV SERVER's host — `127.0.0.1`. That
 *  matches the isLocal rule below, so a phone running against a local dev server
 *  silently resolved to the DEMO project and offered the demo club in the picker.
 *  Caught on the first Android launch, 2026-08-31.
 *
 *  A hostname is only ever meaningful on web. Ask the platform, not the global. */
function hostname(): string {
  if (Platform.OS !== 'web') return '';
  return typeof window !== 'undefined' && window.location
    ? window.location.hostname.toLowerCase()
    : '';
}

function resolveProject(): Project {
  const host = hostname();

  if (!host) {
    // No hostname. Two very different cases:
    //
    // WEB PRERENDER (`web.output: 'static'` renders in Node, where there is no
    // window). Nothing here is fetched at build time and the module re-evaluates
    // in the browser with the real hostname, so this value is never used for real
    // data. Kept as DEMO to leave the prerendered output exactly as it was.
    if (Platform.OS === 'web') return { ...DEMO, isDemo: true };

    // NATIVE. Production unless a dev build explicitly opts into the sandbox with
    // EXPO_PUBLIC_NATIVE_BACKEND=demo. Deliberately the opposite default to the
    // old code: env is inlined into the binary at build time, so "no env" has to
    // mean the safe answer, not the demo one.
    const wants = (process.env.EXPO_PUBLIC_NATIVE_BACKEND ?? '').trim().toLowerCase();
    return wants === 'demo' ? { ...DEMO, isDemo: true } : { ...PROD, isDemo: false };
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  const isNetlifyPreview = host.endsWith('.netlify.app');
  const isDemoHost = host === 'demo.pbtable.com' || host.startsWith('demo.');

  if (isLocal || isNetlifyPreview || isDemoHost) return { ...DEMO, isDemo: true };
  return { ...PROD, isDemo: false };
}

/** Which Supabase project this process talks to. Fixed at module load. */
export const PROJECT: Project = resolveProject();

/** The club the hostname names, or null when there is no hostname (native).
 *  An apex or unrecognised host has no club to show; it is treated as demo
 *  rather than pointing a stranger at production with an empty slug. */
function slugFromHostname(): string | null {
  const host = hostname();
  if (!host) return null;

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  const isNetlifyPreview = host.endsWith('.netlify.app');
  const isDemoHost = host === 'demo.pbtable.com' || host.startsWith('demo.');
  if (isLocal || isNetlifyPreview || isDemoHost) return 'demo';

  // <slug>.pbtable.com — the subdomain IS the club, same rule the dashboard uses.
  const parts = host.split('.');
  const slug = parts.length > 2 ? parts[0] : '';
  if (!slug || slug === 'www') return 'demo';
  return slug;
}

let _slug: string | null = slugFromHostname();

/** The club currently being served, or null if native and nothing is picked yet.
 *
 *  Callers must handle null rather than substituting a default: a wrong slug on
 *  production silently matches no club, and every reader of it (the booking gate,
 *  branding, payments) is a place where guessing would be worse than failing. */
export function getClubSlug(): string | null {
  return _slug;
}

/** Set the current club. Native only in practice — on web the hostname is
 *  authoritative and this is never called. */
export function setClubSlug(slug: string | null): void {
  _slug = slug ? slug.trim().toLowerCase() : null;
}

/** True when the club is decided by the URL and so cannot be picked or changed.
 *  The picker, and the "change club" affordances, exist only where this is false. */
export const CLUB_IS_FROM_HOSTNAME = Platform.OS === 'web';
