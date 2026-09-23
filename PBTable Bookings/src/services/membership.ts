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
//   * A member cannot create one here either. Buying is a Stripe transaction and will
//     be a redirect to Stripe's own hosted checkout, the same shape as the wallet
//     top-up: no card details ever reach this app or PBTable.
//
// getMembershipQuote/getMyMembership are migrations 88 and 89 and work TODAY.
// setMembershipRenewal is migration 91 and works TODAY. The buy path
// (membership-checkout) does not exist yet and is blocked on a Stripe test
// environment, so the screen shows the offer and says joining is not open.

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
};

async function myClubId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('booking_members')
    .select('club_id')
    .eq('auth_user_id', uid)
    .maybeSingle();
  return (data as { club_id: string } | null)?.club_id ?? null;
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
