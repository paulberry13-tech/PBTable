import { BACKEND } from './backend';
import { USE_SUPABASE } from './config';
import { supabase } from './supabaseClient';

/** Is the booking system switched on for the club this hostname serves?
 *
 *  `clubs.settings.booking_enabled` is operator-controlled — Paul turns booking on
 *  per club, and there is deliberately no admin UI for it. The dashboard already
 *  hides its /app link when it is off, but a hidden link is not a gate: the bundle
 *  is committed to every club site, so anyone who types <club>.pbtable.com/app got
 *  in anyway and saw a booking app the club has not launched.
 *
 *  Nobody could actually BOOK — sign-in is invite-only and book_spot binds the
 *  member to auth.uid() — but a half-open door on a live club site is its own
 *  problem. This makes the switch mean what it says.
 *
 *  Fails CLOSED. A club that has not launched booking is the normal case (both live
 *  clubs today), so on a definitive false, an error, or no club row at all we show
 *  the "not open yet" screen rather than the app. Turning booking on stays a single
 *  settings flip with no rebuild. */
export async function bookingEnabledForThisHost(): Promise<{ on: boolean; clubName?: string }> {
  if (!USE_SUPABASE) return { on: true }; // mock mode has no database to ask
  try {
    // Only the settings keys needed, never the whole settings object: it also carries the club's
    // logo as an embedded picture (the demo's was 2.6 MB), and this runs on most screens.
    const { data, error } = await supabase
      .from('clubs')
      .select('name, booking_enabled:settings->booking_enabled')
      .eq('slug', BACKEND.slug)
      .maybeSingle();
    if (error || !data) return { on: false };
    const row = data as { name: string | null; booking_enabled: unknown };
    return { on: row.booking_enabled === true, clubName: row.name ?? undefined };
  } catch {
    return { on: false };
  }
}
