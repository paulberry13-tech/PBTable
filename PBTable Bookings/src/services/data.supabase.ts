// Supabase implementation of the data seam — mapped to the backend that ALREADY
// EXISTS in the PB Table Demo project (booking_members, credits_ledger, the
// polymorphic bookings table, book_spot / session_spots / rdr_leaderboard, and
// the server-side RDR engine). See supabase/BOOKING_APP_NOTES.md.
//
// Wired: sessions (both social_sessions + session_plans), book (book_spot),
// balance + ledger (credits_ledger), leaderboard (rdr_leaderboard).
// Not built server-side yet (marked TODO): cancel_booking, wallet top-up.
//
// IDENTITY SPLIT: leaderboard/directory use `players`; wallet/bookings use
// `booking_members` (linked to a player via player_id). services/auth.ts must
// resolve the login to the booking_members row; its id is the `memberId` passed
// to the wallet/booking calls here.

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
} from '@/services/data';
import type { RatingChange } from '@/domain/ratings';

/** Single-club app: the club whose sessions/leaderboard we show. */
const CLUB_SLUG = process.env.EXPO_PUBLIC_CLUB_SLUG ?? '';

export class InsufficientBalanceError extends Error {
  shortfallPence: number;
  constructor(shortfallPence: number) {
    super('Not enough balance to book this session.');
    this.name = 'InsufficientBalanceError';
    this.shortfallPence = shortfallPence;
  }
}

const notBuiltYet = (what: string): never => {
  throw new Error(`${what} is not built on the backend yet (see BOOKING_APP_NOTES.md).`);
};

// social_sessions = ungraded; session_plans = graded ladders/boxes. bookings
// disambiguate the two via session_kind.
type SessionKind = 'social' | 'graded';

type SessionRow = {
  id: string;
  played_on: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  price_pennies: number | null;
  booking_open: boolean;
  name?: string | null; // social only
  format?: string | null; // social only
  courts?: number | null; // graded only
};

function mapSession(r: SessionRow, kind: SessionKind): Session {
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
    // TODO: roster/booked-count via a join or session_spots(); left empty here.
    bookings: [],
    waitlist: [],
    status: r.booking_open ? 'upcoming' : 'completed',
  };
}

/** Which table owns this session id (needed for the polymorphic bookings). */
async function resolveKind(sessionId: string): Promise<SessionKind> {
  const social = await supabase.from('social_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (social.data) return 'social';
  return 'graded';
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
  const out = [
    ...(social.data as SessionRow[]).map((r) => mapSession(r, 'social')),
    ...(graded.data as SessionRow[]).map((r) => mapSession(r, 'graded')),
  ];
  return out.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

export async function getSession(id: string): Promise<Session> {
  const social = await supabase
    .from('social_sessions')
    .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open')
    .eq('id', id)
    .maybeSingle();
  if (social.data) return mapSession(social.data as SessionRow, 'social');
  const graded = await supabase
    .from('session_plans')
    .select('id,played_on,start_time,end_time,capacity,courts,price_pennies,booking_open')
    .eq('id', id)
    .single();
  if (graded.error) throw graded.error;
  return mapSession(graded.data as SessionRow, 'graded');
}

export async function createSession(_input: CreateSessionInput): Promise<Session> {
  // Admin session creation lives in the existing web planner (social_sessions /
  // session_plans). Wire this to that flow rather than duplicating it.
  return notBuiltYet('Creating a session from the app');
}

// --- booking -----------------------------------------------------------------

export async function bookSession(sessionId: string, memberId: string): Promise<BookResult> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('book_spot', {
    p_session_kind: kind,
    p_session_id: sessionId,
    p_member_id: memberId, // booking_members.id
  });
  if (error) {
    const m = /insufficient_credit:(\d+)/.exec(error.message);
    if (m) throw new InsufficientBalanceError(parseInt(m[1], 10));
    throw new Error(error.message);
  }
  const r = data as { booking_id: string; price_charged: number };
  return {
    waitlisted: false, // no waitlist in this backend (book_spot raises session_full)
    booking: {
      id: r.booking_id,
      sessionId,
      memberId,
      status: 'booked',
      paidPence: r.price_charged,
      bookedAt: new Date().toISOString(),
    },
  };
}

export async function joinWaitlist(): Promise<BookResult> {
  // No waitlist in the current DB model — decision #1 in BOOKING_APP_NOTES.md.
  return notBuiltYet('The waitlist');
}

export async function cancelBooking(_sessionId: string, _memberId: string): Promise<CancellationResult> {
  // TODO: add a cancel_booking(session_kind, session_id, member_id) function that
  // marks the booking cancelled and posts a 'refund' credits_ledger row per the
  // 24-hour policy, then call it here.
  return notBuiltYet('Cancelling a booking');
}

export async function getMyBookings(memberId: string): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'booked');
  if (error) throw error;
  const rows = data as { id: string; session_kind: SessionKind; session_id: string; price_charged_pennies: number; created_at: string }[];
  const out: MyBooking[] = [];
  for (const b of rows) {
    const session = await getSession(b.session_id);
    out.push({
      booking: {
        id: b.id,
        sessionId: b.session_id,
        memberId,
        status: 'booked',
        paidPence: b.price_charged_pennies,
        bookedAt: b.created_at,
      },
      session,
    });
  }
  return out;
}

// --- wallet (credits_ledger; balance = SUM(amount_pennies)) -------------------

export async function getBalance(memberId: string): Promise<number> {
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('amount_pennies')
    .eq('member_id', memberId);
  if (error) throw error;
  return (data as { amount_pennies: number }[]).reduce((sum, r) => sum + r.amount_pennies, 0);
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
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true }); // oldest→newest to compute running balance
  if (error) throw error;
  let running = 0;
  const entries = (data as any[]).map((r) => {
    running += r.amount_pennies;
    return {
      id: String(r.id),
      memberId,
      type: LEDGER_KIND[r.reason] ?? 'refund',
      amountPence: r.amount_pennies,
      balanceAfterPence: running, // credits_ledger has no stored balance; derived
      description: LEDGER_LABEL[r.reason] ?? r.reason,
      sessionId: undefined,
      createdAt: r.created_at,
    } as LedgerEntry;
  });
  return entries.reverse(); // newest first for display
}

export async function topUp(_memberId: string, _amountPence: number): Promise<LedgerEntry> {
  // TODO: real money — a create-topup-checkout Edge Function (Stripe Connect,
  // clubs.stripe_account_id) whose webhook posts a 'topup' credits_ledger row.
  return notBuiltYet('Wallet top-up');
}

// --- members & leaderboard ---------------------------------------------------

export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id,name,guest')
    .order('name', { ascending: true });
  if (error) throw error;
  // Ratings come from rdr_leaderboard (below); directory shows unrated until merged.
  return (data as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: '',
    memberType: r.guest ? 'guest' : 'member',
    ratingState: 'unrated',
    gradedGames: 0,
    balancePence: 0, // wallet lives on booking_members, not players
  }));
}

export async function getMember(id: string): Promise<Member> {
  const m = (await getMembers()).find((x) => x.id === id);
  if (!m) throw new Error('Member not found');
  return m;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('rdr_leaderboard', { club_slug: CLUB_SLUG });
  if (error) throw error;
  // Map the standings rows → LeaderboardEntry. Shape depends on the RPC's return
  // columns (name, rdr, games, …) — confirm against rdr_leaderboard and finish.
  return notBuiltYet('Leaderboard row mapping (rdr_leaderboard returns standings — map its columns)');
}

export async function getMemberMatches(): Promise<{ match: unknown; session: Session }[]> {
  return notBuiltYet('Player match history');
}

// --- court slips & scores (reuse the existing planner + rating engine) --------

export async function generateCourtSlips(): Promise<CourtSlipRound[]> {
  return notBuiltYet('Court slips (ability planner writes social_sessions.plan)');
}
export async function getCourtSlips(): Promise<CourtSlipRound[] | null> {
  return notBuiltYet('Reading court slips');
}
export async function enterScores(): Promise<RatingChange[]> {
  return notBuiltYet('Entering scores (writes matches; RDR engine recomputes)');
}
export async function recalcRatings(): Promise<void> {
  await supabase.rpc('refresh_rdr_standings');
}
