// Which backend the app talks to. Flip EXPO_PUBLIC_USE_SUPABASE=true in .env to
// run against the live PB Table Demo backend; unset/false uses the in-memory mock.
export const USE_SUPABASE = process.env.EXPO_PUBLIC_USE_SUPABASE === 'true';

// When true, wallet top-ups go through real Stripe Checkout (test mode); when
// false, the demo function credits the wallet directly (no card).
export const STRIPE_TOPUP = process.env.EXPO_PUBLIC_STRIPE_TOPUP === 'true';
