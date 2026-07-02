// TODO: swap for Supabase. This module is the ONLY place that knows the data
// is mocked — every function is async and returns fresh copies, exactly as a
// real API client would. Replace the bodies with Supabase queries/RPCs and
// nothing upstream should need to change.

import { cancellationWarning, decideCancellation } from '@/domain/cancellation';
import { applyMatch, RatingChange } from '@/domain/ratings';
import { generateSlips } from '@/domain/slips';
import { buildSeed } from '@/mock/seed';
import {
  Booking,
  CancellationResult,
  CourtSlipRound,
  Match,
  Member,
  Session,
  SessionFormat,
} from '@/types';

// --- in-memory store ---------------------------------------------------------
interface Store {
  members: Member[];
  sessions: Session[];
  matches: Match[];
  slips: Map<string, CourtSlipRound[]>;
  /** Pristine member states from before any match was applied — lets
   *  recalcRatings() do a genuine full replay. */
  baselineMembers: Member[];
  playersPerCourt: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function initStore(): Store {
  const seed = buildSeed();
  const store: Store = {
    members: seed.members,
    sessions: seed.sessions,
    matches: seed.matches,
    slips: new Map(),
    baselineMembers: clone(seed.members),
    playersPerCourt: 4,
  };
  replayAllMatches(store);
  return store;
}

function replayAllMatches(store: Store): void {
  const byId = new Map(store.members.map((m) => [m.id, m]));
  const dates = new Map(store.sessions.map((s) => [s.id, s.date]));
  [...store.matches]
    .sort((a, b) => a.seq - b.seq)
    .forEach((m) => applyMatch(m, byId, dates.get(m.sessionId) ?? m.id));
}

const store = initStore();

/** Simulated network latency so screens exercise real loading states. */
const delay = (ms = 220) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}-${idSeq++}`;

function findSession(id: string): Session {
  const s = store.sessions.find((x) => x.id === id);
  if (!s) throw new Error(`Session not found: ${id}`);
  return s;
}
function findMember(id: string): Member {
  const m = store.members.find((x) => x.id === id);
  if (!m) throw new Error(`Member not found: ${id}`);
  return m;
}

const activeBookings = (s: Session) => s.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');

// --- sessions ------------------------------------------------------------------

export async function getSessions(): Promise<Session[]> {
  await delay();
  return clone(
    [...store.sessions].sort((a, b) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    )
  );
}

export async function getSession(id: string): Promise<Session> {
  await delay(120);
  return clone(findSession(id));
}

export interface CreateSessionInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  courts: number;
  capacity: number;
  format: SessionFormat;
  affectsRating: boolean;
  skillMin?: number;
  skillMax?: number;
  pricePence: number;
  isRecurring: boolean;
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  await delay();
  const session: Session = {
    ...input,
    id: nextId('s'),
    bookings: [],
    waitlist: [],
    status: 'upcoming',
  };
  store.sessions.push(session);
  return clone(session);
}

// --- booking ---------------------------------------------------------------------

export interface BookResult {
  booking: Booking;
  waitlisted: boolean;
  position?: number;
}

/** Books a spot (payment is handled by services/payments.ts before calling this).
 *  If the session is full, the member joins the waitlist instead. */
export async function bookSession(sessionId: string, memberId: string, paidPence: number): Promise<BookResult> {
  await delay();
  const session = findSession(sessionId);
  findMember(memberId);
  if (session.bookings.some((b) => b.memberId === memberId && (b.status === 'booked' || b.status === 'waitlisted'))) {
    throw new Error('You already have a booking for this session.');
  }
  const full = activeBookings(session).length >= session.capacity;
  const booking: Booking = {
    id: nextId('b'),
    sessionId,
    memberId,
    status: full ? 'waitlisted' : 'booked',
    paidPence,
    bookedAt: new Date().toISOString(),
  };
  session.bookings.push(booking);
  if (full) session.waitlist.push(memberId);
  return { booking: clone(booking), waitlisted: full, position: full ? session.waitlist.length : undefined };
}

export async function joinWaitlist(sessionId: string, memberId: string): Promise<BookResult> {
  return bookSession(sessionId, memberId, 0);
}

/** DEMO helper: books available members into free spots so the admin can run
 *  the full loop on a freshly created session without 12 phone-taps.
 *  Would not exist in production. Returns how many were added. */
export async function demoFillSession(sessionId: string): Promise<number> {
  await delay();
  const session = findSession(sessionId);
  const already = new Set(
    session.bookings
      .filter((b) => b.status === 'booked' || b.status === 'waitlisted' || b.status === 'attended')
      .map((b) => b.memberId)
  );
  const inBand = (m: Member) =>
    session.skillMin === undefined ||
    (m.rating !== undefined && m.rating >= session.skillMin && m.rating <= (session.skillMax ?? 99));
  const candidates = store.members.filter(
    (m) => !already.has(m.id) && m.ratingState !== 'unrated' && inBand(m)
  );
  let added = 0;
  for (const m of candidates) {
    if (activeBookings(session).length >= session.capacity) break;
    session.bookings.push({
      id: nextId('b'),
      sessionId,
      memberId: m.id,
      status: 'booked',
      paidPence: session.pricePence,
      bookedAt: new Date().toISOString(),
    });
    added += 1;
  }
  return added;
}

/** Promotes the first waitlister into a freed spot. Returns the member, or null. */
function promoteFirstWaitlister(session: Session): Member | null {
  while (session.waitlist.length > 0) {
    const nextMemberId = session.waitlist.shift() as string;
    const wlBooking = session.bookings.find(
      (b) => b.memberId === nextMemberId && b.status === 'waitlisted'
    );
    if (wlBooking) {
      wlBooking.status = 'booked';
      wlBooking.paidPence = session.pricePence; // simulated charge on promotion
      return findMember(nextMemberId);
    }
  }
  return null;
}

/** Cancels a booking, applying THE 24-hour policy (domain/cancellation.ts). */
export async function cancelBooking(sessionId: string, memberId: string): Promise<CancellationResult> {
  await delay();
  const session = findSession(sessionId);
  const bk = session.bookings.find(
    (b) => b.memberId === memberId && (b.status === 'booked' || b.status === 'waitlisted')
  );
  if (!bk) throw new Error('No active booking found.');

  // Waitlisted bookings can always be abandoned freely (nothing was charged).
  if (bk.status === 'waitlisted') {
    bk.status = 'cancelled';
    session.waitlist = session.waitlist.filter((id) => id !== memberId);
    return { refunded: false, refundPence: 0, policyNote: 'Left the waitlist.' };
  }

  const decision = decideCancellation(session);
  bk.status = 'cancelled';
  const promoted = promoteFirstWaitlister(session);

  const refundDue = decision.refundNow || (decision.refundIfResold && promoted !== null);
  const refundPence = refundDue ? bk.paidPence : 0;
  if (refundDue && bk.paidPence > 0) bk.refundedPence = bk.paidPence;

  let policyNote: string;
  if (bk.paidPence === 0) {
    policyNote = 'Free booking cancelled — spot released.';
  } else if (decision.refundNow) {
    policyNote = 'Cancelled more than 24 hours before start — full refund issued.';
  } else if (refundDue) {
    policyNote = 'Within 24 hours, but your spot was re-sold to the waitlist — full refund issued.';
  } else {
    policyNote = 'Cancelled within 24 hours of start — no refund (no waitlister took the spot).';
  }

  return {
    refunded: refundDue && bk.paidPence > 0,
    refundPence,
    promotedMemberName: promoted?.name,
    policyNote,
  };
}

/** Pre-cancellation warning copy for the confirm dialog. */
export async function getCancellationWarning(sessionId: string, memberId: string): Promise<string> {
  await delay(60);
  const session = findSession(sessionId);
  const bk = session.bookings.find(
    (b) => b.memberId === memberId && (b.status === 'booked' || b.status === 'waitlisted')
  );
  if (bk?.status === 'waitlisted') return 'You will leave the waitlist. Nothing has been charged.';
  return cancellationWarning(session, bk?.paidPence ?? 0);
}

export interface MyBooking {
  booking: Booking;
  session: Session;
}

export async function getMyBookings(memberId: string): Promise<MyBooking[]> {
  await delay();
  const out: MyBooking[] = [];
  for (const session of store.sessions) {
    for (const b of session.bookings) {
      if (b.memberId === memberId && b.status !== 'cancelled') {
        out.push({ booking: clone(b), session: clone(session) });
      }
    }
  }
  return out.sort((a, b) =>
    `${a.session.date}T${a.session.startTime}`.localeCompare(`${b.session.date}T${b.session.startTime}`)
  );
}

// --- members & leaderboard ---------------------------------------------------------

export async function getMembers(): Promise<Member[]> {
  await delay();
  return clone([...store.members].sort((a, b) => a.name.localeCompare(b.name)));
}

export async function getMember(id: string): Promise<Member> {
  await delay(120);
  return clone(findMember(id));
}

export interface LeaderboardEntry {
  rank: number;
  member: Member;
  /** Rating movement since the previous history point: 'up' | 'down' | 'flat'. */
  movement: 'up' | 'down' | 'flat';
  movementDelta: number;
  hot: boolean;
}

/** RULE: rated players only — ratingState !== 'unrated' AND gradedGames > 0.
 *  Unrated members must never show a phantom rating here. */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await delay();
  const eligible = store.members.filter(
    (m) => m.ratingState !== 'unrated' && m.gradedGames > 0 && m.rating !== undefined
  );
  const ranked = [...eligible].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return ranked.map((m, i) => {
    const h = m.ratingHistory ?? [];
    const prev = h.length >= 2 ? h[h.length - 2].rating : h[0]?.rating ?? m.rating ?? 0;
    const delta = Math.round(((m.rating ?? 0) - prev) * 100) / 100;
    return {
      rank: i + 1,
      member: clone(m),
      movement: delta > 0.001 ? 'up' : delta < -0.001 ? 'down' : 'flat',
      movementDelta: delta,
      hot: (m.streak ?? 0) >= 3,
    };
  });
}

export async function getMemberMatches(memberId: string): Promise<{ match: Match; session: Session }[]> {
  await delay();
  return store.matches
    .filter((x) => x.team1.includes(memberId) || x.team2.includes(memberId))
    .sort((a, b) => b.seq - a.seq)
    .map((match) => ({
      match: clone(match),
      session: clone(findSession(match.sessionId)),
    }));
}

// --- court slips & scores (the differentiator loop) -------------------------------------

export async function generateCourtSlips(sessionId: string, rounds = 3): Promise<CourtSlipRound[]> {
  await delay(400); // a touch slower: feels like real work
  const session = findSession(sessionId);
  const playerIds = activeBookings(session).map((b) => b.memberId);
  const players = playerIds.map((id) => findMember(id));
  if (players.length < store.playersPerCourt) {
    throw new Error(`Need at least ${store.playersPerCourt} booked players to generate slips.`);
  }
  const slips = generateSlips(session, players, rounds, store.playersPerCourt);
  store.slips.set(sessionId, slips);
  return clone(slips);
}

export async function getCourtSlips(sessionId: string): Promise<CourtSlipRound[] | null> {
  await delay(80);
  const slips = store.slips.get(sessionId);
  return slips ? clone(slips) : null;
}

export interface ScoreEntry {
  team1: [string, string];
  team2: [string, string];
  score1: number;
  score2: number;
}

/** Saves scores for a graded session, creates Match rows, runs the RDR update
 *  per game in order, marks the session completed. Returns the rating changes. */
export async function enterScores(sessionId: string, entries: ScoreEntry[]): Promise<RatingChange[]> {
  await delay(400);
  const session = findSession(sessionId);
  if (!session.affectsRating) throw new Error('This session is not graded — scores do not affect ratings.');
  const valid = entries.filter((e) => e.score1 + e.score2 > 0);
  if (valid.length === 0) throw new Error('Enter at least one score.');

  const byId = new Map(store.members.map((m) => [m.id, m]));
  const baseSeq = store.matches.reduce((max, m) => Math.max(max, m.seq), 0);
  const changes: RatingChange[] = [];
  valid.forEach((e, i) => {
    const match: Match = {
      id: nextId('x'),
      sessionId,
      seq: baseSeq + i + 1,
      team1: e.team1,
      team2: e.team2,
      score1: e.score1,
      score2: e.score2,
    };
    store.matches.push(match);
    changes.push(...applyMatch(match, byId, session.date));
  });

  session.status = 'completed';
  session.bookings.forEach((b) => {
    if (b.status === 'booked') b.status = 'attended';
  });
  return changes;
}

/** Full deterministic replay of every match from the pristine baseline —
 *  the "recompute the world" escape hatch a real backend would run in a job. */
export async function recalcRatings(): Promise<void> {
  await delay(500);
  store.members = clone(store.baselineMembers);
  replayAllMatches(store);
}
