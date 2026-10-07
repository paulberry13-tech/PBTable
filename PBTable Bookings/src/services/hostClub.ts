import { BACKEND } from './backend';
import { supabase } from './supabaseClient';

/** The id of the club THIS hostname serves (swindon.pbtable.com -> Swindon).
 *
 *  One email login can belong to more than one club: booking_members holds one row per
 *  club, keyed (club_id, auth_user_id). Every "which member am I" lookup therefore has to
 *  be scoped to the club whose site the member is on. Looking up by login alone made a
 *  member of two clubs unable to sign in at either (.single() refuses two rows), and let a
 *  Gloucester member signed in on swindon.pbtable.com see Gloucester's sessions and wallet
 *  under Swindon's name. (Council review, 2026-09-13.)
 *
 *  Cached per slug. A failed lookup is not cached, so a network blip is retried next time
 *  rather than remembered as "no club". */
let cached: { slug: string; id: string | null } | null = null;
// Screens starting together share one lookup instead of each asking (start-up asked three times).
let inFlight: Promise<string | null> | null = null;

export async function hostClubId(): Promise<string | null> {
  const slug = BACKEND.slug;
  if (!slug) return null;
  if (cached && cached.slug === slug) return cached.id;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { data, error } = await supabase.from('clubs').select('id').eq('slug', slug).maybeSingle();
    if (error) return null;
    cached = { slug, id: (data as { id: string } | null)?.id ?? null };
    return cached.id;
  })().finally(() => { inFlight = null; });
  return inFlight;
}
