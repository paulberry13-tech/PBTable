// Which backend the app talks to. Flip EXPO_PUBLIC_USE_SUPABASE=true in .env to
// run against the live PB Table Demo backend; unset/false uses the in-memory mock.
export const USE_SUPABASE = process.env.EXPO_PUBLIC_USE_SUPABASE === 'true';
