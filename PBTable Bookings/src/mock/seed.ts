import { expectedScore } from '@/domain/ratings';
import {
  Booking,
  LedgerEntryType,
  Match,
  Member,
  MemberType,
  RatingState,
  Session,
  SessionFormat,
} from '@/types';

/**
 * Mock dataset for the POC. Deterministic (seeded PRNG) so every reload
 * shows the same club, but dated relative to "today" so the demo always
 * has upcoming sessions.
 *
 * Completed sessions come with Match rows; services/data.ts replays them
 * through the REAL rating engine on init, so ratings, histories, streaks
 * and win rates are all internally consistent on first load.
 */

// --- tiny seeded PRNG (LCG) ------------------------------------------------
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// --- date helpers ------------------------------------------------------------
function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}
function isoDateTime(daysFromToday: number, time: string): string {
  return `${isoDate(daysFromToday)}T${time}:00`;
}
/** Days from today until the next occurrence of a weekday (0=Sun..6=Sat). */
function daysToNext(dow: number, minDaysAhead: number): number {
  const today = new Date().getDay();
  let diff = (dow - today + 7) % 7;
  while (diff < minDaysAhead) diff += 7;
  return diff;
}

// --- members -----------------------------------------------------------------
const FIRST = ['Sarah', 'James', 'Emma', 'Oliver', 'Sophie', 'Harry', 'Charlotte', 'George',
  'Amelia', 'Jack', 'Isla', 'Thomas', 'Grace', 'William', 'Freya', 'Daniel', 'Lily', 'Matthew',
  'Evie', 'Joshua', 'Poppy', 'Samuel', 'Ruby', 'Benjamin', 'Ella', 'Alexander', 'Mia', 'Edward',
  'Chloe', 'Henry', 'Daisy', 'Lewis', 'Alice', 'Callum', 'Holly', 'Ryan', 'Jessica', 'Adam', 'Megan'];
const LAST = ['Thompson', 'Walker', 'Patel', 'Hughes', 'Robinson', 'Clarke', 'Khan', 'Wood',
  'Turner', 'Bennett', 'Murphy', 'Griffiths', 'Owen', 'Price', 'Morgan', 'Rees', 'Bailey',
  'Chapman', 'Fletcher', 'Dawson', 'Ellis', 'Harrison', 'Kaur', 'Lloyd', 'Marshall', 'Nolan',
  'O’Brien', 'Pearce', 'Quinn', 'Reid', 'Shaw', 'Todd', 'Vaughan', 'Webb', 'Young', 'Barker',
  'Cole', 'Dunn', 'Field'];

function makeMember(
  i: number,
  memberType: MemberType,
  ratingState: RatingState,
  rating: number | undefined,
  gradedGames: number
): Member {
  const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
  return {
    id: `m-${i + 1}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.co.uk`,
    memberType,
    ratingState,
    rating,
    gradedGames,
    winRate: ratingState === 'unrated' ? undefined : Math.round((0.35 + rand() * 0.3) * 100) / 100,
    streak: ratingState === 'unrated' ? undefined : randInt(-2, 3),
    ratingHistory:
      rating !== undefined
        ? [{ date: isoDate(-45), rating: Math.round((rating - 0.15 + rand() * 0.3) * 100) / 100 }]
        : undefined,
    balancePence: 0, // filled by the ledger replay in services/data.ts
  };
}

/** A raw ledger movement to be replayed into real LedgerEntry rows on init. */
export interface LedgerSeed {
  memberId: string;
  type: LedgerEntryType;
  /** Signed pence: + deposit/refund, − spend. */
  amountPence: number;
  description: string;
  sessionId?: string;
  daysAgo: number;
}

export interface SeedData {
  members: Member[];
  sessions: Session[];
  matches: Match[];
  ledgerSeeds: LedgerSeed[];
  currentUserId: string;
}

let bookingSeq = 1;
function booking(sessionId: string, memberId: string, pricePence: number, daysAgo: number, status: Booking['status'] = 'booked'): Booking {
  return {
    id: `b-${bookingSeq++}`,
    sessionId,
    memberId,
    status,
    paidPence: pricePence,
    bookedAt: isoDateTime(-daysAgo, `${String(randInt(8, 21)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}`),
  };
}

export function buildSeed(): SeedData {
  seedState = 42;
  bookingSeq = 1;

  const members: Member[] = [];

  // The mock current user — a rated club regular.
  const paul: Member = {
    id: 'm-paul',
    name: 'Paul Berry',
    email: 'paul@pbtable.co.uk',
    memberType: 'member',
    ratingState: 'rated',
    rating: 3.72,
    gradedGames: 24,
    winRate: 0.58,
    streak: 2,
    ratingHistory: [{ date: isoDate(-45), rating: 3.61 }],
    balancePence: 0, // filled by the ledger replay
  };
  members.push(paul);

  // ~20 rated members, ratings spread 2.6–4.4.
  for (let i = 0; i < 20; i += 1) {
    const rating = Math.round((2.6 + (i / 19) * 1.8) * 100) / 100;
    members.push(makeMember(i, i === 7 || i === 13 ? 'junior' : 'member', 'rated', rating, randInt(12, 40)));
  }
  // ~8 provisional members.
  for (let i = 20; i < 28; i += 1) {
    const rating = Math.round((2.8 + rand() * 1.2) * 100) / 100;
    members.push(makeMember(i, 'member', 'provisional', rating, randInt(1, 4)));
  }
  // ~8 unrated members — never played a graded game.
  for (let i = 28; i < 36; i += 1) {
    members.push(makeMember(i, i === 33 ? 'junior' : 'member', 'unrated', undefined, 0));
  }
  // ~4 guests (unrated).
  for (let i = 36; i < 40; i += 1) {
    members.push(makeMember(i, 'guest', 'unrated', undefined, 0));
  }

  const ratedPool = members.filter((m) => m.ratingState !== 'unrated');

  // --- completed graded sessions, replayed oldest-first through the engine ---
  const sessions: Session[] = [];
  const matches: Match[] = [];
  let matchSeq = 1;

  const completedSpecs: { daysAgo: number; title: string; format: SessionFormat; courts: number; price: number }[] = [
    { daysAgo: 21, title: 'Club Night Doubles', format: 'round_robin', courts: 3, price: 600 },
    { daysAgo: 17, title: 'Box League Round 1', format: 'box_league', courts: 2, price: 500 },
    { daysAgo: 14, title: 'Thursday Club League', format: 'round_robin', courts: 3, price: 600 },
    { daysAgo: 10, title: 'Intermediate Ladder Night', format: 'ladder', courts: 3, price: 500 },
    { daysAgo: 7, title: 'Box League Round 2', format: 'box_league', courts: 2, price: 500 },
    { daysAgo: 3, title: 'Club Night Doubles', format: 'round_robin', courts: 3, price: 600 },
  ];

  completedSpecs.forEach((spec, si) => {
    const id = `s-past-${si + 1}`;
    const capacity = spec.courts * 4;
    // Pick players: Paul plays in most sessions so his profile is rich.
    const shuffled = [...ratedPool].sort(() => rand() - 0.5).filter((m) => m.id !== 'm-paul');
    const includePaul = si !== 1;
    const players = (includePaul ? [paul, ...shuffled] : shuffled).slice(0, capacity);

    const session: Session = {
      id,
      title: spec.title,
      date: isoDate(-spec.daysAgo),
      startTime: '19:00',
      endTime: '21:00',
      courts: spec.courts,
      capacity,
      format: spec.format,
      affectsRating: true,
      pricePence: spec.price,
      isRecurring: false,
      bookings: players.map((p) => booking(id, p.id, spec.price, spec.daysAgo + randInt(2, 6), 'attended')),
      waitlist: [],
      status: 'completed',
    };
    sessions.push(session);

    // 3 rounds of matches per session; blocks of 4 by rating, strong-with-weak teams.
    for (let round = 0; round < 3; round += 1) {
      const ordered = [...players].sort((a, b) => (b.rating ?? 3) - (a.rating ?? 3));
      // vary groupings by round
      if (round > 0) {
        for (let i = round; i + 1 < ordered.length; i += 3) {
          [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
        }
      }
      for (let c = 0; c * 4 + 3 < ordered.length && c < spec.courts; c += 1) {
        const [a, b, cc, d] = ordered.slice(c * 4, c * 4 + 4);
        const team1: [string, string] = [a.id, d.id];
        const team2: [string, string] = [b.id, cc.id];
        // Realistic scores: stronger team more likely to reach 11 first.
        const t1 = ((a.rating ?? 3) + (d.rating ?? 3)) / 2;
        const t2 = ((b.rating ?? 3) + (cc.rating ?? 3)) / 2;
        const p1 = expectedScore(t1, t2);
        const team1Wins = rand() < p1;
        const loserScore = randInt(3, 9);
        const match: Match = {
          id: `x-${matchSeq}`,
          sessionId: id,
          seq: matchSeq,
          team1,
          team2,
          score1: team1Wins ? 11 : loserScore,
          score2: team1Wins ? loserScore : 11,
        };
        matchSeq += 1;
        matches.push(match);
      }
    }
  });

  // --- upcoming sessions -------------------------------------------------------
  const others = members.filter((m) => m.id !== 'm-paul');
  const ratedOthers = others.filter((m) => m.ratingState !== 'unrated');
  const anyOthers = [...others].sort(() => rand() - 0.5);

  function fill(sessionId: string, pool: Member[], count: number, price: number, daysAgoMax = 6): Booking[] {
    return pool.slice(0, count).map((m) => booking(sessionId, m.id, price, randInt(0, daysAgoMax)));
  }

  const upcoming: Session[] = [];

  // 1. TONIGHT, full, waitlist, Paul booked — demos the within-24h cancel + resold refund.
  {
    const id = 's-up-1';
    const price = 600;
    const pool = [...ratedOthers].sort(() => rand() - 0.5);
    const s: Session = {
      id,
      title: 'Club Night Doubles',
      date: isoDate(0),
      startTime: '19:30',
      endTime: '21:30',
      courts: 3,
      capacity: 12,
      format: 'round_robin',
      affectsRating: true,
      pricePence: price,
      isRecurring: true,
      bookings: [booking(id, 'm-paul', price, 4), ...fill(id, pool, 11, price)],
      waitlist: [pool[11].id, pool[12].id],
      status: 'upcoming',
    };
    s.bookings.push(booking(id, pool[11].id, price, 1, 'waitlisted'), booking(id, pool[12].id, price, 0, 'waitlisted'));
    upcoming.push(s);
  }

  // 2. Thursday league in 3 days, FULL with waitlist, Paul booked — demos >24h cancel with promotion.
  {
    const id = 's-up-2';
    const price = 600;
    const pool = [...ratedOthers].sort(() => rand() - 0.5);
    const s: Session = {
      id,
      title: 'Thursday Club League',
      date: isoDate(daysToNext(4, 2)),
      startTime: '19:00',
      endTime: '21:00',
      courts: 3,
      capacity: 12,
      format: 'round_robin',
      affectsRating: true,
      pricePence: price,
      isRecurring: true,
      bookings: [booking(id, 'm-paul', price, 3), ...fill(id, pool, 11, price)],
      waitlist: [pool[11].id],
      status: 'upcoming',
    };
    s.bookings.push(booking(id, pool[11].id, price, 1, 'waitlisted'));
    upcoming.push(s);
  }

  // 3. Saturday Social Mixer — ungraded, plenty of space.
  upcoming.push({
    id: 's-up-3',
    title: 'Saturday Social Mixer',
    date: isoDate(daysToNext(6, 1)),
    startTime: '10:00',
    endTime: '12:00',
    courts: 4,
    capacity: 16,
    format: 'social',
    affectsRating: false,
    pricePence: 400,
    isRecurring: true,
    bookings: fill('s-up-3', anyOthers, 9, 400),
    waitlist: [],
    status: 'upcoming',
  });

  // 4. Friday Free Play — FREE.
  upcoming.push({
    id: 's-up-4',
    title: 'Friday Free Play',
    date: isoDate(daysToNext(5, 1)),
    startTime: '17:30',
    endTime: '19:00',
    courts: 2,
    capacity: 8,
    format: 'social',
    affectsRating: false,
    pricePence: 0,
    isRecurring: false,
    bookings: fill('s-up-4', [...anyOthers].reverse(), 5, 0),
    waitlist: [],
    status: 'upcoming',
  });

  // 5. Intermediate Ladder Night — graded, skill-banded 3.0–4.0.
  upcoming.push({
    id: 's-up-5',
    title: 'Intermediate Ladder Night',
    date: isoDate(5),
    startTime: '19:00',
    endTime: '21:00',
    courts: 3,
    capacity: 12,
    format: 'ladder',
    affectsRating: true,
    skillMin: 3.0,
    skillMax: 4.0,
    pricePence: 500,
    isRecurring: true,
    bookings: fill('s-up-5', ratedOthers.filter((m) => (m.rating ?? 0) >= 3.0 && (m.rating ?? 0) <= 4.0), 7, 500),
    waitlist: [],
    status: 'upcoming',
  });

  // 6. Beginners Coached Clinic — ungraded, great for unrated members.
  upcoming.push({
    id: 's-up-6',
    title: 'Beginners Coached Clinic',
    date: isoDate(4),
    startTime: '18:00',
    endTime: '19:30',
    courts: 2,
    capacity: 8,
    format: 'coached',
    affectsRating: false,
    pricePence: 800,
    isRecurring: false,
    bookings: fill('s-up-6', others.filter((m) => m.ratingState === 'unrated'), 4, 800),
    waitlist: [],
    status: 'upcoming',
  });

  // 7. Advanced Ladder — graded, skill-banded 3.8–5.0.
  upcoming.push({
    id: 's-up-7',
    title: 'Advanced Ladder — Top Boards',
    date: isoDate(6),
    startTime: '20:00',
    endTime: '22:00',
    courts: 2,
    capacity: 8,
    format: 'ladder',
    affectsRating: true,
    skillMin: 3.8,
    skillMax: 5.0,
    pricePence: 700,
    isRecurring: false,
    bookings: fill('s-up-7', ratedOthers.filter((m) => (m.rating ?? 0) >= 3.8), 5, 700),
    waitlist: [],
    status: 'upcoming',
  });

  // 8. Box League Round 3 — graded.
  upcoming.push({
    id: 's-up-8',
    title: 'Box League Round 3',
    date: isoDate(7),
    startTime: '19:00',
    endTime: '21:00',
    courts: 2,
    capacity: 8,
    format: 'box_league',
    affectsRating: true,
    pricePence: 500,
    isRecurring: true,
    bookings: fill('s-up-8', [...ratedOthers].sort(() => rand() - 0.5), 6, 500),
    waitlist: [],
    status: 'upcoming',
  });

  // 9. Sunday Morning Round Robin — graded, over a week out.
  upcoming.push({
    id: 's-up-9',
    title: 'Sunday Morning Round Robin',
    date: isoDate(daysToNext(0, 3)),
    startTime: '09:30',
    endTime: '11:30',
    courts: 4,
    capacity: 16,
    format: 'round_robin',
    affectsRating: true,
    pricePence: 600,
    isRecurring: true,
    bookings: fill('s-up-9', [...anyOthers].sort(() => rand() - 0.5), 8, 600),
    waitlist: [],
    status: 'upcoming',
  });

  sessions.push(...upcoming);

  // --- wallet ledger --------------------------------------------------------
  // Money is stored in pence; "credits" (1 = £2) are a display layer. Paul
  // gets a real, reconciling ledger (top-ups + the sessions he's booked) so
  // his Wallet screen tells a story on first load. Everyone else gets a single
  // generous opening balance — enough to book freely (demo fills, promotions).
  const ledgerSeeds: LedgerSeed[] = [
    { memberId: 'm-paul', type: 'deposit', amountPence: 4000, description: 'Top-up · 20 credits', daysAgo: 35 },
    { memberId: 'm-paul', type: 'spend', amountPence: -600, description: 'Club Night Doubles', sessionId: 's-past-1', daysAgo: 19 },
    { memberId: 'm-paul', type: 'spend', amountPence: -600, description: 'Thursday Club League', sessionId: 's-past-3', daysAgo: 14 },
    { memberId: 'm-paul', type: 'spend', amountPence: -500, description: 'Intermediate Ladder Night', sessionId: 's-past-4', daysAgo: 10 },
    { memberId: 'm-paul', type: 'deposit', amountPence: 2000, description: 'Top-up · 10 credits', daysAgo: 8 },
    { memberId: 'm-paul', type: 'spend', amountPence: -600, description: 'Club Night Doubles', sessionId: 's-up-1', daysAgo: 4 },
    { memberId: 'm-paul', type: 'spend', amountPence: -600, description: 'Thursday Club League', sessionId: 's-up-2', daysAgo: 3 },
  ];
  for (const m of members) {
    if (m.id === 'm-paul') continue;
    const credits = randInt(15, 35); // £30–£70, whole credits
    ledgerSeeds.push({
      memberId: m.id,
      type: 'deposit',
      amountPence: credits * 200,
      description: 'Opening balance',
      daysAgo: 30,
    });
  }

  return { members, sessions, matches, ledgerSeeds, currentUserId: 'm-paul' };
}
