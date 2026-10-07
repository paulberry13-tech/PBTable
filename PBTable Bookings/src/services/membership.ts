// What a member may know and do about their own club membership.
//
// Memberships are the club's annual subscription, bought through Stripe and worth
// MEMBER PRICING and nothing else.
//
//   * A member CAN turn their own auto-renewal on or off (Paul, 2026-09-24, reversing
//     the 2026-09-23 "read-only" decision below this comment used to describe). Turning
//     it off keeps member pricing for every day already paid for; it just stops Stripe
//     charging again when the year ends. It can be turned back on any time before then.
//     See setMembershipRenewal, which calls the membership-renewal edge function --
//     never a direct table write, because only Stripe's own confirmation may change
//     what the database believes about a subscription.
//   * A member cannot END a membership early, still. That stays a conversation with the
//     club: it stops billing immediately and the refund is the club's money and the
//     club's decision to agree. An admin does that from the dashboard.
//   * Joining is a redirect to Stripe's own hosted checkout on the club's account, the
//     same shape as the wallet top-up: no card details ever reach this app or PBTable.
//     startMembershipCheckout / confirmMembership call the membership-checkout edge
//     function (migration 93); nothing here writes a membership row.
//
// getMembershipQuote/getMyMembership are migrations 88 and 89; setMembershipRenewal is 91;
// joining is 93.

import { Platform } from 'react-native';

import { BACKEND } from '@/services/backend';
import { openOutside } from '@/services/embed';
import { hostClubId } from '@/services/hostClub';
import { supabase } from '@/services/supabaseClient';

/** One membership as its owner sees it. Null when they have never had one. */
export type MyMembership = {
  id: string;
  /** Stripe's own word: active, trialing, past_due, canceled, unpaid, paused… */
  status: string;
  /** End of the year they have paid for. */
  current_period_end: string | null;
  /** When the 30 days after a failed payment run out. */
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  /** Set when the club ended it early. */
  ended_at: string | null;
  plan_name: string | null;
  price_pennies: number | null;
  /** The terms THEY joined under, which may not be what the club sells now. */
  billing_mode: 'calendar' | 'anniversary' | null;
};

/** What the club is selling, and what this person would pay if they joined today. */
export type MembershipQuote = {
  enabled: boolean;
  billing_mode?: 'calendar' | 'anniversary' | null;
  plan?: { id: string; name: string; price_pennies: number } | null;
  /** The date the first FULL year is charged. */
  renews_on?: string | null;
  /** Calendar clubs only: a part-year first charge. */
  pro_rata?: boolean;
  /** Joining in December is free until the following 1 January. */
  december_free?: boolean;
  /** Anniversary clubs only: the whole price, from today. */
  first_charge_pennies?: number | null;
  /** Every type on sale (migration 94). `plan` is the first of them, for older screens. */
  /** join_pennies: what joining costs today under the type's joining price steps, or null (no steps:
   *  the by-the-day part-year charge applies). Migration 94, section 13. */
  types?: { id: string; name: string; price_pennies: number; description: string | null; join_pennies?: number | null }[];
  /** The words of the "pass my details on to register the membership" tick (migration 94,
   *  section 12). Absent on a backend before it. */
  share_wording?: string | null;
};

// The club THIS site serves. It used to be "the club my login belongs to", which errored for
// anyone in two clubs (maybeSingle refuses two rows), so the tab vanished for them.
async function myClubId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.user?.id) return null;
  return hostClubId();
}

/** Null where the club does not sell memberships, or the migrations are not applied. */
export async function getMembershipQuote(): Promise<MembershipQuote | null> {
  const club = await myClubId();
  if (!club) return null;
  // Throws on a backend without migration 89 (PGRST202). That is not an error worth
  // showing anybody: it means this club has no memberships, which is most of them.
  const { data, error } = await supabase.rpc('membership_quote', { p_club: club });
  if (error || !data) return null;
  return data as MembershipQuote;
}

/** This member's own membership, or null if they have never had one. */
export async function getMyMembership(): Promise<MyMembership | null> {
  const club = await myClubId();
  if (!club) return null;
  const { data, error } = await supabase.rpc('my_membership', { p_club: club });
  if (error || !data) return null;
  return data as MyMembership;
}

/** How the club's own screens describe this membership, in one place. */
export function membershipStateLabel(m: MyMembership | null): {
  key: 'none' | 'active' | 'cancelling' | 'failing' | 'ended' | 'lapsed';
  label: string;
} {
  if (!m) return { key: 'none', label: 'Not a member' };
  if (m.ended_at) return { key: 'ended', label: 'Ended' };
  if (m.status === 'past_due') {
    const inGrace = !!m.grace_ends_at && Date.now() < Date.parse(m.grace_ends_at);
    return inGrace
      ? { key: 'failing', label: 'Payment failed' }
      : { key: 'lapsed', label: 'Lapsed' };
  }
  if (m.status === 'active' || m.status === 'trialing') {
    return m.cancel_at_period_end
      ? { key: 'cancelling', label: 'Ends at the end of the year' }
      : { key: 'active', label: 'Member' };
  }
  return { key: 'lapsed', label: 'Lapsed' };
}

/** Whole days left before member pricing stops after a failed payment. */
export function graceDaysLeft(m: MyMembership | null): number | null {
  if (!m || !m.grace_ends_at) return null;
  const left = Date.parse(m.grace_ends_at) - Date.now();
  return left <= 0 ? 0 : Math.ceil(left / 86400000);
}

/** The message an edge function sent back with a non-2xx reply, or a plain fallback. */
async function fnMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context;
  const body = await ctx?.json?.().catch(() => null);
  return body?.error ?? (error as { message?: string } | null)?.message ?? fallback;
}

/** Start joining: membership-checkout checks the member may join, then hands back Stripe's
 *  own checkout page on the CLUB's account. Card details never reach this app. */
export async function startMembershipCheckout(planId: string, playerId: string):
    Promise<{ ok: true; url: string } | { ok: false; error: string; needDetails?: boolean }> {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.functions.invoke('membership-checkout', {
    body: { action: 'start', slug: BACKEND.slug, origin, plan_id: planId, player_id: playerId },
  });
  if (error) return { ok: false, error: await fnMessage(error, 'Could not start joining. Try again.') };
  const url = (data as { url?: string })?.url;
  if (!url) return { ok: false, error: (data as { error?: string })?.error ?? 'Could not start joining. Try again.' };
  return { ok: true, url };
}

/** Stripe's own page, on the club's account, to update the card behind a membership the
 *  caller pays for. Opens it in the whole window (it will not show inside a frame). */
export async function openMembershipPortal(membershipId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.functions.invoke('membership-portal', {
    body: { membership_id: membershipId, origin },
  });
  if (error) return { ok: false, error: await fnMessage(error, 'Could not open the card page. Try again.') };
  const url = (data as { url?: string })?.url;
  if (!url) return { ok: false, error: (data as { error?: string })?.error ?? 'Could not open the card page.' };
  try { await openOutside(url); } catch (e) { return { ok: false, error: (e as Error)?.message ?? 'Could not open the card page.' }; }
  return { ok: true };
}

export type MembershipConfirm =
  | { ok: true; recorded: number; pending: boolean; status: string | null }
  | { ok: false; error: string; terminal: boolean };

/** Record what Stripe says after joining. With the session id from the return address it
 *  records that sign-up; without one it looks through this member's recent membership
 *  checkouts, which covers a cleared browser or a tab closed too soon. */
export async function confirmMembership(sessionId: string | null): Promise<MembershipConfirm> {
  const { data, error } = await supabase.functions.invoke('membership-checkout', {
    body: { action: 'confirm', slug: BACKEND.slug, ...(sessionId ? { session_id: sessionId } : {}) },
  });
  if (error) {
    const status = Number((error as { context?: { status?: number } })?.context?.status) || 0;
    // A 4xx other than 401 will never succeed (most often a reference left by somebody who
    // used this browser before), so the screen should stop retrying it. 401 is a token
    // mid-refresh and is worth keeping.
    return { ok: false, error: await fnMessage(error, 'Could not confirm your membership.'),
             terminal: status >= 400 && status < 500 && status !== 401 };
  }
  const d = data as { ok?: boolean; error?: string; recorded?: number; pending?: boolean; status?: string | null };
  if (!d?.ok) return { ok: false, error: d?.error ?? 'Could not confirm your membership.', terminal: true };
  return { ok: true, recorded: d.recorded ?? 0, pending: !!d.pending, status: d.status ?? null };
}

/** What the edge function actually returned, so the screen can react to a real result
 *  rather than assume the request that left the phone is the one that arrived. */
export type RenewalResult =
  | { ok: true; renews: boolean; message?: string }
  | { ok: false; error: string };

/** Turn this membership's own auto-renewal on or off. Never writes the database directly
 *  — the edge function tells Stripe first, and only records it once Stripe agrees, so the
 *  screen is never shown a state the subscription does not actually have. */
export async function setMembershipRenewal(membershipId: string, renews: boolean): Promise<RenewalResult> {
  const { data, error } = await supabase.functions.invoke('membership-renewal', {
    body: { membership_id: membershipId, renews },
  });
  if (error) {
    // supabase-js surfaces a non-2xx response as `error` with the body still reachable
    // via context; fall back to a plain message if that shape is not present.
    const bodyErr = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    const parsed = await bodyErr?.json?.().catch(() => null);
    return { ok: false, error: parsed?.error ?? error.message ?? 'Could not reach the server. Try again.' };
  }
  return data as RenewalResult;
}
