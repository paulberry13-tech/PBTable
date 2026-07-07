// Supabase implementation of the data seam — the real backend behind the same
// interface as services/data.ts (the mock). Screens import from '@/services/data';
// to go live you swap that module for this one (or re-export this from there).
//
// STATUS: the booking layer (sessions, bookings, wallet) is wired to the schema
// and the server-authoritative RPCs in supabase/migrations/. The parts that
// reuse the EXISTING engine (RDR leaderboard, court slips, entering scores) are
// marked TODO — they should call the club's existing rating/planner rather than
// be reimplemented here.

import { supabase } from '@/services/supabaseClient';
import type {
  Booking,
  CancellationResult,
  CourtSlipRound,
  LedgerEntry,
  Member,
  Session,
} from '@/types';
// Type-only imports (erased at build → no coupling to the mock's in-memory store).
import type {
  BookResult,
  CreateSessionInput,
  LeaderboardEntry,
  MyBooking,
} from '@/services/data';
import type { RatingChange } from '@/domain/ratings';

/** Thrown when the wallet can't cover the price — mirrors the mock so screens
 *  can `catch (e) { if (e instanceof InsufficientBalanceError) … }` unchanged. */
export class InsufficientBalanceError extends Error {
  shortfallPence: number;
  constructor(shortfallPence: number) {
    super('Not enough balance to book this session.');
    this.name = 'InsufficientBalanceError';
    this.shortfallPence = shortfallPence;
  }
}

const notImplemented = (what: string): never => {
  throw new Error(
    `${what} runs on the existing PBTable engine — wire it to the club's rating/planner (see migration notes).`
  );
};

// --- row → domain mappers ----------------------------------------------------

type SessionRow = {
  id: string;
  name: string | null;
  played_on: string;
  start_time: string | null;
  end_time: string | null;
  courts: number | null;
  capacity: number | null;
  format: string;
  affects_rating: boolean;
  skill_min: number | null;
  skill_max: number | null;
  price_pence: number;
  booking_status: string;
  bookings?: BookingRow[];
};
type BookingRow = {
  id: string;
  session_id: string;
  player_id: string;
  status: Booking['status'];
  paid_pence: number;
  refunded_pence: number | null;
  waitlist_pos: number | null;
  booked_at: string;
};

function mapBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    sessionId: r.session_id,
    memberId: r.player_id,
    status: r.status,
    paidPence: r.paid_pence,
    refundedPence: r.refunded_pence ?? undefined,
    bookedAt: r.booked_at,
  };
}

function mapSession(r: SessionRow): Session {
  const bookings = (r.bookings ?? []).map(mapBooking);
  const waitlist = (r.bookings ?? [])
    .filter((b) => b.status === 'waitlisted')
    .sort((a, b) => (a.waitlist_pos ?? 0) - (b.waitlist_pos ?? 0))
    .map((b) => b.player_id);
  return {
    id: r.id,
    title: r.name ?? 'Session',
    date: r.played_on,
    startTime: r.start_time ?? '19:00',
    endTime: r.end_time ?? '21:00',
    courts: r.courts ?? 0,
    capacity: r.capacity ?? 0,
    format: r.format as Session['format'],
    affectsRating: r.affects_rating,
    skillMin: r.skill_min ?? undefined,
    skillMax: r.skill_max ?? undefined,
    pricePence: r.price_pence,
    isRecurring: false, // TODO: model recurrence if needed
    bookings,
    waitlist,
    status: r.booking_status === 'cancelled' ? 'cancelled' : 'upcoming',
  };
}

const SESSION_SELECT =
  'id,name,played_on,start_time,end_time,courts,capacity,format,affects_rating,skill_min,skill_max,price_pence,booking_status,bookings(*)';

// --- sessions ----------------------------------------------------------------

export async function getSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from('social_sessions')
    .select(SESSION_SELECT)
    .order('played_on', { ascending: true });
  if (error) throw error;
  return (data as SessionRow[]).map(mapSession);
}

export async function getSession(id: string): Promise<Session> {
  const { data, error } = await supabase
    .from('social_sessions')
    .select(SESSION_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapSession(data as SessionRow);
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const { data, error } = await supabase
    .from('social_sessions')
    .insert({
      name: input.title,
      played_on: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      courts: input.courts,
      capacity: input.capacity,
      format: input.format,
      affects_rating: input.affectsRating,
      skill_min: input.skillMin ?? null,
      skill_max: input.skillMax ?? null,
      price_pence: input.pricePence,
      booking_status: 'open',
      // club_id is applied by a DB default/trigger or set from the admin's club.
    })
    .select(SESSION_SELECT)
    .single();
  if (error) throw error;
  return mapSession(data as SessionRow);
}

// --- booking (server-authoritative RPCs) ------------------------------------

export async function bookSession(sessionId: string, _memberId: string): Promise<BookResult> {
  // The RPC books for the AUTHENTICATED member (auth.uid()); memberId is ignored
  // on purpose — you can only book for yourself.
  const { data, error } = await supabase.rpc('app_book_session', { p_session: sessionId });
  if (error) {
    if (/insufficient_balance|not enough balance/i.test(error.message)) {
      throw new InsufficientBalanceError(parseInt(error.details ?? '0', 10) || 0);
    }
    throw new Error(error.message);
  }
  const r = data as { waitlisted: boolean; position?: number; booking_id: string; paid_pence?: number };
  return {
    waitlisted: r.waitlisted,
    position: r.position,
    booking: {
      id: r.booking_id,
      sessionId,
      memberId: _memberId,
      status: r.waitlisted ? 'waitlisted' : 'booked',
      paidPence: r.paid_pence ?? 0,
      bookedAt: new Date().toISOString(),
    },
  };
}

export async function joinWaitlist(sessionId: string, memberId: string): Promise<BookResult> {
  return bookSession(sessionId, memberId);
}

export async function cancelBooking(sessionId: string, _memberId: string): Promise<CancellationResult> {
  const { data, error } = await supabase.rpc('app_cancel_booking', { p_session: sessionId });
  if (error) throw new Error(error.message);
  const r = data as { refunded: boolean; refund_pence: number; promoted_name?: string; note: string };
  return {
    refunded: r.refunded,
    refundPence: r.refund_pence,
    promotedMemberName: r.promoted_name ?? undefined,
    policyNote: r.note,
  };
}

export async function getMyBookings(memberId: string): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`*, session:social_sessions(${SESSION_SELECT})`)
    .eq('player_id', memberId)
    .neq('status', 'cancelled');
  if (error) throw error;
  return (data as (BookingRow & { session: SessionRow })[]).map((row) => ({
    booking: mapBooking(row),
    session: mapSession(row.session),
  }));
}

// --- wallet ------------------------------------------------------------------

export async function getBalance(memberId: string): Promise<number> {
  const { data, error } = await supabase
    .from('players')
    .select('wallet_pence')
    .eq('id', memberId)
    .single();
  if (error) throw error;
  return (data as { wallet_pence: number }).wallet_pence;
}

export async function getLedger(memberId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('player_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as any[]).map((r) => ({
    id: r.id,
    memberId: r.player_id,
    type: r.kind,
    amountPence: r.amount_pence,
    balanceAfterPence: r.balance_after_pence,
    description: r.description,
    sessionId: r.session_id ?? undefined,
    createdAt: r.created_at,
  }));
}

/** Top-ups add REAL money, so they must go through Stripe: the app calls a
 *  `wallet-topup` Edge Function that creates the payment and, on success,
 *  calls app_wallet_topup() with the service role. The client never credits
 *  its own balance. */
export async function topUp(_memberId: string, amountPence: number): Promise<LedgerEntry> {
  const { data, error } = await supabase.functions.invoke('wallet-topup', {
    body: { amount_pence: amountPence },
  });
  if (error) throw new Error(error.message);
  return data as LedgerEntry;
}

// --- members & leaderboard ---------------------------------------------------

export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id,name,email,member_type,wallet_pence,guest')
    .order('name', { ascending: true });
  if (error) throw error;
  // NOTE: rating/ratingState/gradedGames come from the RDR engine (derived from
  // `matches`), not stored on players. Merge them in from the club leaderboard
  // (see getLeaderboard TODO). Until then, members read as unrated.
  return (data as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    memberType: r.member_type,
    ratingState: 'unrated',
    gradedGames: 0,
    balancePence: r.wallet_pence,
  }));
}

export async function getMember(id: string): Promise<Member> {
  const members = await getMembers();
  const m = members.find((x) => x.id === id);
  if (!m) throw new Error('Member not found');
  return m;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  // TODO: read the club's existing RDR leaderboard. The engine derives current
  // RDR, games, streak and movement from `matches` — expose it as a Postgres
  // view/function (e.g. club_leaderboard(club_id)) and map rows here. This is
  // the same computation the current web leaderboard already performs.
  return notImplemented('The leaderboard');
}

export async function getMemberMatches(): Promise<{ match: any; session: Session }[]> {
  return notImplemented('Player match history');
}

// --- court slips & scores (reuse the existing engine) ------------------------

export async function generateCourtSlips(): Promise<CourtSlipRound[]> {
  // Balanced slips already come from the ability planner into social_sessions.plan.
  return notImplemented('Generating court slips');
}

export async function getCourtSlips(): Promise<CourtSlipRound[] | null> {
  return notImplemented('Reading court slips');
}

export async function enterScores(): Promise<RatingChange[]> {
  // Scores are written to `matches`; the RDR engine recomputes ratings.
  return notImplemented('Entering scores');
}

export async function recalcRatings(): Promise<void> {
  return notImplemented('Rating recalculation');
}
