// The club the native app is currently serving: picked once, persisted, and
// thereafter overruled by the signed-in member's own membership.
// See docs/DECISION-01-CLUB-RESOLUTION.md.
//
// On web this module is inert — the hostname decides, and nothing here is called.
//
// AsyncStorage, not SecureStore: a slug is not a credential, SecureStore has no
// web implementation (SDK 57), and AsyncStorage is already what persists the
// Supabase auth session on native (supabaseClient.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';

import { CLUB_IS_FROM_HOSTNAME, getClubSlug, setClubSlug } from './backend';
import { resetClubCaches } from './data.supabase';
import { supabase } from './supabaseClient';

const KEY = 'pbtable.club.v1';

export type ClubOption = {
  id: string;
  slug: string;
  name: string;
  /** settings.logo_url — shown in the picker so a club is recognisable at a glance. */
  logoUrl: string | null;
};

/** Read the stored club and make it current. Returns null when nothing is stored
 *  (first launch) or the store cannot be read — either way the picker is shown. */
export async function loadStoredClub(): Promise<ClubOption | null> {
  if (CLUB_IS_FROM_HOSTNAME) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const club = JSON.parse(raw) as ClubOption;
    if (!club?.slug) return null;
    setClubSlug(club.slug);
    return club;
  } catch {
    // Corrupt or unreadable: treat as "not chosen yet" rather than crashing the
    // launch. The picker writes a good value over it.
    return null;
  }
}

/** Make this club current and remember it. */
export async function chooseClub(club: ClubOption): Promise<void> {
  setClubSlug(club.slug);
  resetClubCaches();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(club));
  } catch {
    // Persisting is a convenience — the club is already current for this launch,
    // so a failed write costs a re-pick next time, not this session.
  }
}

/** Forget the picked club, sending the next launch back to the picker. Used by the
 *  "change club" affordance. */
export async function clearStoredClub(): Promise<void> {
  setClubSlug(null);
  resetClubCaches();
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nothing to do — the slug is already cleared in memory */
  }
}

/** The clubs a member can pick from: every club with booking switched on.
 *
 *  `clubs` is readable by anon (03_rls_policies.sql: clubs_public_read), and
 *  migration 47's column list still includes name, slug and settings — so this
 *  needs no migration and no RPC.
 *
 *  Filtering on booking_enabled matters: it is the same operator switch clubGate
 *  reads, so an unfiltered list could offer a club that immediately dead-ends on
 *  the "booking isn't open yet" screen. Compared strictly against `true` for the
 *  same reason clubGate does — anything else means "not switched on". */
export async function listBookableClubs(): Promise<ClubOption[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('id,name,slug,settings')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    slug: string | null;
    settings: Record<string, unknown> | null;
  }[];

  return rows
    .filter((r) => !!r.slug && r.settings?.booking_enabled === true)
    .map((r) => ({
      id: r.id,
      slug: (r.slug as string).toLowerCase(),
      name: (r.name ?? '').trim() || (r.slug as string),
      logoUrl:
        typeof r.settings?.logo_url === 'string' && (r.settings.logo_url as string).trim()
          ? (r.settings.logo_url as string).trim()
          : null,
    }));
}

/** After sign-in: the member's OWN club wins over whatever was picked.
 *
 *  booking_members is looked up by auth_user_id alone (auth.supabase.ts), with no
 *  club in the query — so signing in with a Gloucester membership after picking
 *  Swindon would otherwise show Gloucester's data under Swindon's name. The picked
 *  club is only ever a pre-authentication default.
 *
 *  Returns the slug now in force, or null if it could not be determined (in which
 *  case the picked club stands — this must never sign anybody out of a club over a
 *  dropped request).
 *
 *  Deliberately takes the FIRST membership rather than erroring on several:
 *  booking_members is unique per (club_id, auth_user_id), so one person can hold
 *  memberships at two clubs. Nothing else in the app supports that yet — see the
 *  `.single()` in getCurrentUser — but this is not the place to fail over it. */
export async function reconcileClubToMembership(): Promise<string | null> {
  if (CLUB_IS_FROM_HOSTNAME) return getClubSlug();
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return getClubSlug();

    const { data: rows, error } = await supabase
      .from('booking_members')
      .select('club_id')
      .eq('auth_user_id', uid)
      .is('revoked_at', null)
      .limit(1);
    if (error) return getClubSlug();
    const clubId = (rows as { club_id: string }[] | null)?.[0]?.club_id;
    if (!clubId) return getClubSlug();

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .select('id,name,slug,settings')
      .eq('id', clubId)
      .maybeSingle();
    if (clubErr || !club) return getClubSlug();

    const row = club as {
      id: string;
      name: string | null;
      slug: string | null;
      settings: Record<string, unknown> | null;
    };
    if (!row.slug) return getClubSlug();

    const slug = row.slug.toLowerCase();
    if (slug === getClubSlug()) return slug;   // already right — the common case

    await chooseClub({
      id: row.id,
      slug,
      name: (row.name ?? '').trim() || slug,
      logoUrl:
        typeof row.settings?.logo_url === 'string' && (row.settings.logo_url as string).trim()
          ? (row.settings.logo_url as string).trim()
          : null,
    });
    return slug;
  } catch {
    return getClubSlug();
  }
}
