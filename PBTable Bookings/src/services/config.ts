// Feature flags. Anything that must NOT be true on a club site is gated on
// BACKEND.isDemo as well as its env var, because `expo export` inlines env at
// build time: if the committed bundle were ever built from the demo .env, an
// env-only gate would carry demo behaviour onto every club subdomain. The
// hostname check is evaluated in the browser, so it can't be baked in wrong.
import { BACKEND } from './backend';

// Which backend the app talks to. Flip EXPO_PUBLIC_USE_SUPABASE=true in .env to
// run against a live backend; unset/false uses the in-memory mock.
export const USE_SUPABASE = process.env.EXPO_PUBLIC_USE_SUPABASE === 'true';

/** The club this build is serving — 'demo', or the subdomain on a club site. */
export const CLUB_SLUG = BACKEND.slug;

// When true, wallet top-ups go through real Stripe Checkout; when false, the
// demo function credits the wallet directly (no card).
// Demo-only for now: the Stripe keys behind create-topup-checkout live on the
// demo project in TEST mode. A club site would call the same function on the
// production project, which has no keys configured — so the button would fail.
// Lift the isDemo gate in the same change that puts live keys on production.
export const STRIPE_TOPUP = process.env.EXPO_PUBLIC_STRIPE_TOPUP === 'true' && BACKEND.isDemo;

// Demo mode: the fixed demo member's credentials. When DEMO_AUTOLOGIN is on the
// app auto-signs-in as this member on load, so the demo /app/ opens with no
// sign-in screen at all. The isDemo gate is the hard guarantee that a club site
// can never auto-sign-in as anybody, whatever the build was configured with.
export const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '';
export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';
export const DEMO_AUTOLOGIN =
  process.env.EXPO_PUBLIC_DEMO_AUTOLOGIN === 'true' &&
  !!DEMO_EMAIL &&
  !!DEMO_PASSWORD &&
  BACKEND.isDemo;
