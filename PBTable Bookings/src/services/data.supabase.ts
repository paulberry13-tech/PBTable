// Supabase implementation of the data seam — mapped to the backend in the PB
// Table Demo project (booking_members, credits_ledger, polymorphic bookings,
// book_spot / cancel_booking / rdr_leaderboard, server-side RDR engine).
//
// Member flows (browse, book, cancel, wallet, leaderboard) are wired. Admin /
// engine flows (create session, slips, enter scores) reuse the existing web
// planner and are stubbed here.

import { Linking, Platform } from 'react-native';

import { STRIPE_TOPUP } from '@/services/config';
import { InsufficientBalanceError } from '@/services/contracts';
import { supabase } from '@/services/supabaseClient';
import type {
  Booking,
  CancellationResult,
  CourtSlipRound,
  LedgerEntry,
  Member,
  Session,
} from '@/types';
import type {
  BookResult,
  CreateSessionInput,
  LeaderboardEntry,
  MyBooking,
} from '@/services/data.mock';
import type { RatingChange } from '@/domain/ratings';

export { InsufficientBalanceError };

/** Single-club app: whose sessions/leaderboard we show. */
const CLUB_SLUG = process.env.EXPO_PUBLIC_CLUB_SLUG ?? '';

const notBuiltYet = (what: string): never => {
  throw new Error(`${what} isn't wired to the backend yet (reuses the existing web planner).`);
};

type SessionKind = 'social' | 'graded';

// --- row → domain mappers ----------------------------------------------------

type SessionRow = {
  id: string;
  played_on: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  price_pennies: number | null;
  booking_open: boolean;
  name?: string | null;
  format?: string | null;
  courts?: number | null;
};

function mapSession(r: SessionRow, kind: SessionKind, bookedCount: number, mine: Booking[]): Session {
  // The caller's own bookings are real (so "you're booked" detection works);
  // the rest of the roster is anonymous placeholders up to the true booked
  // count (RLS hides other members' rows).
  const mineBooked = mine.filter((b) => b.status === 'booked' || b.status === 'attended');
  const placeholders = Math.max(0, bookedCount - mineBooked.length);
  const bookings: Booking[] = [...mine];
  for (let i = 0; i < placeholders; i += 1) {
    bookings.push({
      id: `ph-${r.id}-${i}`,
      sessionId: r.id,
      memberId: '__other__',
      status: 'booked',
      paidPence: 0,
      bookedAt: '',
    });
  }
  const waitlist = mine.filter((b) => b.status === 'waitlisted').map((b) => b.memberId);
  return {
    id: r.id,
    title: r.name ?? (kind === 'graded' ? 'Graded session' : 'Social session'),
    date: r.played_on,
    startTime: r.start_time ?? '19:00',
    endTime: r.end_time ?? '21:00',
    courts: r.courts ?? 0,
    capacity: r.capacity ?? 0,
    format: (r.format as Session['format']) ?? 'round_robin',
    affectsRating: kind === 'graded',
    pricePence: r.price_pennies ?? 0,
    isRecurring: false,
    bookings,
    waitlist,
    status: r.booking_open ? 'upcoming' : 'completed',
  };
}

type BookingRow = {
  id: string;
  session_id: string;
  member_id: string;
  status: Booking['status'];
  price_charged_pennies: number;
  created_at: string;
};
const mapBooking = (b: BookingRow): Booking => ({
  id: b.id,
  sessionId: b.session_id,
  memberId: b.member_id,
  status: b.status,
  paidPence: b.price_charged_pennies,
  bookedAt: b.created_at,
});

/** Bookings the caller is allowed to see (their own, per RLS). Used to know
 *  which sessions the current member is already on; NOT for spot counts (those
 *  come from session_spots, which counts everyone). Degrades to empty rather
 *  than throwing when unreadable (e.g. signed out). */
async function myBookingsForSessions(ids: string[]): Promise<Map<string, Booking[]>> {
  const map = new Map<string, Booking[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('bookings')
    .select('id,session_id,member_id,status,price_charged_pennies,created_at')
    .in('session_id', ids)
    .in('status', ['booked', 'waitlisted', 'attended']);
  if (error || !data) return map;
  for (const b of data as BookingRow[]) {
    const list = map.get(b.session_id) ?? [];
    list.push(mapBooking(b));
    map.set(b.session_id, list);
  }
  return map;
}

/** Accurate booked-count per session via the SECURITY DEFINER RPC (counts all
 *  bookings, not just the caller's). Returns session_id → booked count. */
async function bookedCounts(sessions: { id: string; kind: SessionKind }[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await Promise.all(
    sessions.map(async ({ id, kind }) => {
      const { data } = await supabase.rpc('session_spots', { p_session_kind: kind, p_session_id: id });
      const booked = (data as { booked?: number } | null)?.booked ?? 0;
      counts.set(id, booked);
    })
  );
  return counts;
}

async function resolveKind(sessionId: string): Promise<SessionKind> {
  const social = await supabase.from('social_sessions').select('id').eq('id', sessionId).maybeSingle();
  return social.data ? 'social' : 'graded';
}

// --- sessions ----------------------------------------------------------------

export async function getSessions(): Promise<Session[]> {
  const [social, graded] = await Promise.all([
    supabase
      .from('social_sessions')
      .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open')
      .eq('booking_open', true),
    supabase
      .from('session_plans')
      .select('id,played_on,start_time,end_time,capacity,courts,price_pennies,booking_open')
      .eq('booking_open', true),
  ]);
  if (social.error) throw social.error;
  if (graded.error) throw graded.error;
  const rows: [SessionRow, SessionKind][] = [
    ...(social.data as SessionRow[]).map((r) => [r, 'social'] as [SessionRow, SessionKind]),
    ...(graded.data as SessionRow[]).map((r) => [r, 'graded'] as [SessionRow, SessionKind]),
  ];
  const [counts, mine] = await Promise.all([
    bookedCounts(rows.map(([r, kind]) => ({ id: r.id, kind }))),
    myBookingsForSessions(rows.map(([r]) => r.id)),
  ]);
  return rows
    .map(([r, kind]) => mapSession(r, kind, counts.get(r.id) ?? 0, mine.get(r.id) ?? []))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

export async function getSession(id: string): Promise<Session> {
  const social = await supabase
    .from('social_sessions')
    .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open')
    .eq('id', id)
    .maybeSingle();
  const kind: SessionKind = social.data ? 'social' : 'graded';
  let row = social.data as SessionRow | null;
  if (!row) {
    const graded = await supabase
      .from('session_plans')
      .select('id,played_on,start_time,end_time,capacity,courts,price_pennies,booking_open')
      .eq('id', id)
      .single();
    if (graded.error) throw graded.error;
    row = graded.data as SessionRow;
  }
  const [counts, mine] = await Promise.all([
    bookedCounts([{ id, kind }]),
    myBookingsForSessions([id]),
  ]);
  return mapSession(row, kind, counts.get(id) ?? 0, mine.get(id) ?? []);
}

export async function createSession(_input: CreateSessionInput): Promise<Session> {
  return notBuiltYet('Creating a session from the app');
}

export async function demoFillSession(_sessionId: string): Promise<number> {
  return notBuiltYet('Demo-filling a session');
}

// --- booking (server-authoritative RPCs) ------------------------------------

export async function bookSession(sessionId: string, memberId: string): Promise<BookResult> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('book_spot', {
    p_session_kind: kind,
    p_session_id: sessionId,
    p_member_id: memberId,
  });
  if (error) {
    const m = /insufficient_credit:(\d+)/.exec(error.message);
    if (m) throw new InsufficientBalanceError(parseInt(m[1], 10));
    throw new Error(error.message);
  }
  const r = data as { booking_id: string; waitlisted: boolean; position?: number; price_charged?: number };
  return {
    waitlisted: r.waitlisted,
    position: r.position,
    booking: {
      id: r.booking_id,
      sessionId,
      memberId,
      status: r.waitlisted ? 'waitlisted' : 'booked',
      paidPence: r.price_charged ?? 0,
      bookedAt: new Date().toISOString(),
    },
  };
}

export async function joinWaitlist(sessionId: string, memberId: string): Promise<BookResult> {
  return bookSession(sessionId, memberId);
}

export async function cancelBooking(sessionId: string, _memberId: string): Promise<CancellationResult> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_session_kind: kind,
    p_session_id: sessionId,
    p_member_id: _memberId,
  });
  if (error) throw new Error(error.message);
  const r = data as { refunded: boolean; refund_pence: number; promoted_name?: string; note: string };
  return {
    refunded: r.refunded,
    refundPence: r.refund_pence,
    promotedMemberName: r.promoted_name ?? undefined,
    policyNote: r.note,
  };
}

export async function getCancellationWarning(): Promise<string> {
  return (
    'Cancelling follows your club’s cancellation policy. If you’re outside the cutoff (or a ' +
    'waitlister takes your spot), the money goes back to your balance.'
  );
}

export async function getMyBookings(memberId: string): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,session_kind,session_id,member_id,status,price_charged_pennies,created_at')
    .eq('member_id', memberId)
    .in('status', ['booked', 'waitlisted', 'attended']);
  if (error) throw error;
  const rows = data as (BookingRow & { session_kind: SessionKind })[];
  const out: MyBooking[] = [];
  for (const b of rows) {
    out.push({ booking: mapBooking(b), session: await getSession(b.session_id) });
  }
  return out;
}

// --- wallet ------------------------------------------------------------------

export async function getBalance(memberId: string): Promise<number> {
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('amount_pennies')
    .eq('member_id', memberId);
  if (error) throw error;
  return (data as { amount_pennies: number }[]).reduce((s, r) => s + r.amount_pennies, 0);
}

const LEDGER_KIND: Record<string, LedgerEntry['type']> = {
  topup: 'deposit',
  booking: 'spend',
  refund: 'refund',
  adjustment: 'refund',
};
const LEDGER_LABEL: Record<string, string> = {
  topup: 'Top-up',
  booking: 'Session booking',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

export async function getLedger(memberId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,member_id,amount_pennies,reason,created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  let running = 0;
  const rows = (data as { id: number; amount_pennies: number; reason: string; created_at: string }[]).map((r) => {
    running += r.amount_pennies;
    return {
      id: String(r.id),
      memberId,
      type: LEDGER_KIND[r.reason] ?? 'refund',
      amountPence: r.amount_pennies,
      balanceAfterPence: running,
      description: LEDGER_LABEL[r.reason] ?? r.reason,
      sessionId: undefined,
      createdAt: r.created_at,
    } as LedgerEntry;
  });
  return rows.reverse();
}

export async function topUp(memberId: string, amountPence: number): Promise<LedgerEntry> {
  const synthetic: LedgerEntry = {
    id: `topup-${Date.now()}`,
    memberId,
    type: 'deposit',
    amountPence,
    balanceAfterPence: 0,
    description: 'Top-up',
    createdAt: new Date().toISOString(),
  };

  if (STRIPE_TOPUP) {
    // Real Stripe Checkout (test mode). Redirect to Stripe; the webhook credits
    // the wallet on completion and the app reloads to the success_url.
    const origin = Platform.OS === 'web' ? window.location.origin : 'https://demo.pbtable.com';
    const { data, error } = await supabase.functions.invoke('create-topup-checkout', {
      body: { amount_pennies: amountPence, success_url: `${origin}/`, cancel_url: `${origin}/` },
    });
    if (error) throw new Error(error.message);
    const url = (data as { url?: string })?.url;
    if (!url) throw new Error((data as { error?: string })?.error ?? 'Could not start checkout.');
    await Linking.openURL(url);
    return synthetic;
  }

  // DEMO path: the `wallet-topup` Edge Function credits the wallet directly.
  const { data, error } = await supabase.functions.invoke('wallet-topup', {
    body: { amount_pennies: amountPence },
  });
  if (error) throw new Error(error.message);
  return { ...synthetic, balanceAfterPence: (data as { balance_pence?: number })?.balance_pence ?? 0 };
}

// --- members & leaderboard ---------------------------------------------------

type StandingRow = { pos: number; name: string; rating: number; games: number };

async function standings(): Promise<StandingRow[]> {
  const { data, error } = await supabase.rpc('rdr_leaderboard', { club_slug: CLUB_SLUG });
  if (error) throw error;
  return data as StandingRow[];
}

export async function getMembers(): Promise<Member[]> {
  const [{ data: players, error }, ranks] = await Promise.all([
    supabase.from('players').select('id,name,guest').order('name', { ascending: true }),
    standings(),
  ]);
  if (error) throw error;
  const byName = new Map(ranks.map((r) => [r.name, r]));
  return (players as { id: string; name: string; guest: boolean }[]).map((p) => {
    const rank = byName.get(p.name);
    return {
      id: p.id,
      name: p.name,
      email: '',
      memberType: p.guest ? 'guest' : 'member',
      ratingState: rank && rank.games > 0 ? 'rated' : 'unrated',
      rating: rank?.rating !== undefined ? Math.round(rank.rating * 100) / 100 : undefined,
      gradedGames: rank?.games ?? 0,
      balancePence: 0,
    };
  });
}

export async function getMember(id: string): Promise<Member> {
  const m = (await getMembers()).find((x) => x.id === id);
  if (!m) throw new Error('Member not found');
  return m;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const [ranks, { data: players }] = await Promise.all([
    standings(),
    supabase.from('players').select('id,name'),
  ]);
  const idByName = new Map((players as { id: string; name: string }[]).map((p) => [p.name, p.id]));
  return ranks
    .filter((r) => r.games > 0)
    .map((r) => ({
      rank: r.pos,
      member: {
        id: idByName.get(r.name) ?? r.name,
        name: r.name,
        email: '',
        memberType: 'member' as const,
        ratingState: 'rated' as const,
        rating: Math.round(r.rating * 100) / 100,
        gradedGames: r.games,
        balancePence: 0,
      },
      movement: 'flat' as const, // rdr_leaderboard has no movement column yet
      movementDelta: 0,
      hot: false,
    }));
}

export async function getMemberMatches(): Promise<{ match: unknown; session: Session }[]> {
  return notBuiltYet('Player match history');
}

// --- court slips & scores (reuse the existing planner + rating engine) --------

export async function generateCourtSlips(): Promise<CourtSlipRound[]> {
  return notBuiltYet('Court slips');
}
export async function getCourtSlips(): Promise<CourtSlipRound[] | null> {
  return notBuiltYet('Reading court slips');
}
export async function enterScores(): Promise<RatingChange[]> {
  return notBuiltYet('Entering scores');
}
export async function recalcRatings(): Promise<void> {
  await supabase.rpc('refresh_rdr_standings');
}
