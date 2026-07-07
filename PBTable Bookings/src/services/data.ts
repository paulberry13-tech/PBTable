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
  LedgerEntry,
  LedgerEntryType,
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
  /** Prepaid-wallet ledger — every deposit / spend / refund, newest last. */
  ledger: LedgerEntry[];
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
    ledger: [],
    baselineMembers: [],
    playersPerCourt: 4,
  };
  // Replay the seeded ledger (oldest first) so balances derive from the same
  // running-sum logic the app uses at runtime.
  const byId = new Map(store.members.map((m) => [m.id, m]));
  store.members.forEach((m) => {
    m.balancePence = 0;
  });
  [...seed.ledgerSeeds]
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .forEach((s) => {
      const m = byId.get(s.memberId);
      if (!m) return;
      m.balancePence += s.amountPence;
      store.ledger.push({
        id: nextId('l'),
        memberId: s.memberId,
        type: s.type,
        amountPence: s.amountPence,
        balanceAfterPence: m.balancePence,
        description: s.description,
        sessionId: s.sessionId,
        createdAt: isoNDaysAgo(s.daysAgo),
      });
    });
  // Baseline is captured AFTER balances are set (so recalc keeps wallets) but
  // BEFORE matches move ratings.
  store.baselineMembers = clone(store.members);
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

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}-${idSeq++}`;

const store = initStore();

/** Simulated network latency so screens exercise real loading states. */
const delay = (ms = 220) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

/** Posts a movement to a member's balance and appends the ledger row.
 *  amountPence is signed: + credits the balance, − debits it. */
function postLedger(
  memberId: string,
  type: LedgerEntryType,
  amountPence: number,
  description: string,
  sessionId?: string
): LedgerEntry {
  const m = findMember(memberId);
  m.balancePence += amountPence;
  const entry: LedgerEntry = {
    id: nextId('l'),
    memberId,
    type,
    amountPence,
    balanceAfterPence: m.balancePence,
    description,
    sessionId,
    createdAt: new Date().toISOString(),
  };
  store.ledger.push(entry);
  return entry;
}

/** Thrown by bookSession when the member can't cover the price from balance.
 *  Screens catch this to open the top-up sheet pre-sized to the shortfall. */
export class InsufficientBalanceError extends Error {
  shortfallPence: number;
  constructor(shortfallPence: number) {
    super('Not enough credits to book this session.');
    this.name = 'InsufficientBalanceError';
    this.shortfallPence = shortfallPence;
  }
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

/**
 * Books a spot, drawing the price down from the member's prepaid balance
 * (posting a `spend` ledger entry). If the session is full the member joins
 * the waitlist instead — no charge until they're promoted. Throws
 * InsufficientBalanceError if the balance can't cover a paid session.
 */
export async function bookSession(sessionId: string, memberId: string): Promise<BookResult> {
  await delay();
  const session = findSession(sessionId);
  const member = findMember(memberId);
  if (session.bookings.some((b) => b.memberId === memberId && (b.status === 'booked' || b.status === 'waitlisted'))) {
    throw new Error('You already have a booking for this session.');
  }
  const full = activeBookings(session).length >= session.capacity;
  const cost = full ? 0 : session.pricePence;

  if (!full && cost > 0 && member.balancePence < cost) {
    throw new InsufficientBalanceError(cost - member.balancePence);
  }

  const booking: Booking = {
    id: nextId('b'),
    sessionId,
    memberId,
    status: full ? 'waitlisted' : 'booked',
    paidPence: cost,
    bookedAt: new Date().toISOString(),
  };
  session.bookings.push(booking);
  if (full) session.waitlist.push(memberId);
  if (!full && cost > 0) {
    postLedger(memberId, 'spend', -cost, session.title, sessionId);
  }
  return { booking: clone(booking), waitlisted: full, position: full ? session.waitlist.length : undefined };
}

export async function joinWaitlist(sessionId: string, memberId: string): Promise<BookResult> {
  return bookSession(sessionId, memberId);
}

// --- wallet / credits --------------------------------------------------------

export async function getBalance(memberId: string): Promise<number> {
  await delay(80);
  return findMember(memberId).balancePence;
}

export async function getLedger(memberId: string): Promise<LedgerEntry[]> {
  await delay(140);
  return clone(
    store.ledger
      .filter((e) => e.memberId === memberId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
}

/** Simulated top-up — the card charge (always succeeds) happens in the UI via
 *  services/payments.ts; this posts the resulting deposit to the balance. */
export async function topUp(memberId: string, amountPence: number): Promise<LedgerEntry> {
  await delay();
  const credits = Math.round(amountPence / 200);
  const entry = postLedger(
    memberId,
    'deposit',
    amountPence,
    `Top-up · ${credits} credit${credits === 1 ? '' : 's'}`
  );
  return clone(entry);
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
    if (session.pricePence > 0) {
      postLedger(m.id, 'spend', -session.pricePence, session.title, sessionId);
    }
    added += 1;
  }
  return added;
}

/** Promotes the first waitlister into a freed spot, drawing the price from
 *  their balance (the seat is charged on promotion). Returns the member, or null. */
function promoteFirstWaitlister(session: Session): Member | null {
  while (session.waitlist.length > 0) {
    const nextMemberId = session.waitlist.shift() as string;
    const wlBooking = session.bookings.find(
      (b) => b.memberId === nextMemberId && b.status === 'waitlisted'
    );
    if (wlBooking) {
      wlBooking.status = 'booked';
      wlBooking.paidPence = session.pricePence;
      if (session.pricePence > 0) {
        postLedger(nextMemberId, 'spend', -session.pricePence, `${session.title} (from waitlist)`, session.id);
      }
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
  if (refundDue && bk.paidPence > 0) {
    bk.refundedPence = bk.paidPence;
    // Refunds go back to the wallet as credits, not out to a card.
    postLedger(memberId, 'refund', bk.paidPence, `Refund · ${session.title}`, sessionId);
  }

  let policyNote: string;
  if (bk.paidPence === 0) {
    policyNote = 'Free booking cancelled — spot released.';
  } else if (decision.refundNow) {
    policyNote = `Cancelled more than 24 hours before start — ${formatPenceShort(refundPence)} credited to your balance.`;
  } else if (refundDue) {
    policyNote = `Within 24 hours, but your spot was re-sold to the waitlist — ${formatPenceShort(refundPence)} credited to your balance.`;
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

/** "£6" / "£5.50" — compact money for policy copy. */
function formatPenceShort(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
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
 *  the "recompute the world" escape hatch a real backend would run in a job.
 *  Preserves live wallet balances (only ratings are recomputed). */
export async function recalcRatings(): Promise<void> {
  await delay(500);
  const balances = new Map(store.members.map((m) => [m.id, m.balancePence]));
  store.members = clone(store.baselineMembers);
  store.members.forEach((m) => {
    m.balancePence = balances.get(m.id) ?? m.balancePence;
  });
  replayAllMatches(store);
}
