// Feature flags. Anything that must NOT be true on a club site is gated on
// PROJECT.isDemo as well as its env var, because `expo export` inlines env at
// build time: if the committed bundle were ever built from the demo .env, an
// env-only gate would carry demo behaviour onto every club subdomain. On web the
// project is resolved from the hostname in the browser, so it can't be baked in
// wrong; on native it is a build constant that defaults to PRODUCTION, so a
// missing env can't quietly select the demo sandbox either.
import { Platform } from 'react-native';

import { PROJECT } from './backend';

// Which backend the app talks to.
//
// WEB: opt-in. Flip EXPO_PUBLIC_USE_SUPABASE=true in .env to run against a live
// backend; unset/false uses the in-memory mock, which is what the POC demo and
// local UI work run on.
//
// NATIVE: opt-OUT, because there is no reason to ship a phone app wired to an
// in-memory mock — a store build with no env must be the real thing, and the mock
// has no club, no picker and no sign-in. Set EXPO_PUBLIC_USE_SUPABASE=false to get
// the mock back for offline UI work.
export const USE_SUPABASE =
  Platform.OS === 'web'
    ? process.env.EXPO_PUBLIC_USE_SUPABASE === 'true'
    : process.env.EXPO_PUBLIC_USE_SUPABASE !== 'false';

// When true, wallet top-ups go through real Stripe Checkout; when false, the
// demo function credits the wallet directly (no card).
// Demo-only for now: the Stripe keys behind create-topup-checkout live on the
// demo project in TEST mode. A club site would call the same function on the
// production project, which has no keys configured — so the button would fail.
// Lift the isDemo gate in the same change that puts live keys on production.
export const STRIPE_TOPUP = process.env.EXPO_PUBLIC_STRIPE_TOPUP === 'true' && PROJECT.isDemo;

/** Is the fake card form allowed at all?
 *
 *  There is a second top-up path that presents a card form, says "Demo payment —
 *  no card is charged" in small type, and calls a function that mints wallet credit
 *  with no payment behind it. It exists so the demo can be shown end to end.
 *
 *  It was reachable on CLUB sites, because it is simply the `else` of STRIPE_TOPUP
 *  and STRIPE_TOPUP is hard-wired to demo. So a Gloucester member opening their
 *  wallet was shown a realistic card form that did nothing — an invitation to type
 *  a real card number into a dead end. The function it calls is not deployed to
 *  production, which is the only reason it was merely useless rather than harmful.
 *
 *  Never on a real club, whatever the build was configured with. */
export const DEMO_TOPUP = !STRIPE_TOPUP && PROJECT.isDemo;

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
  PROJECT.isDemo;
