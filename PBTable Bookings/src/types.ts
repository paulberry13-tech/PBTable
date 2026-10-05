/** PBTable domain model — shared across mock services and (later) the real backend. */

export type MemberType = 'member' | 'guest' | 'junior';
export type RatingState = 'unrated' | 'provisional' | 'rated';

export interface Member {
  id: string;
  name: string;
  email: string;
  memberType: MemberType;
  ratingState: RatingState;
  /** Present ONLY if provisional/rated; undefined if unrated. */
  rating?: number;
  /** Games that counted toward the rating. */
  gradedGames: number;
  winRate?: number;
  /** Positive = win streak, negative = losing streak. */
  streak?: number;
  ratingHistory?: { date: string; rating: number }[];
  /**
   * Prepaid wallet balance in PENCE — money deposited against the member,
   * drawn down by bookings. Kept in sync with the ledger (LedgerEntry rows)
   * by services/data.ts.
   */
  balancePence: number;
}

/**
 * A movement on a member's prepaid balance. Deposits/refunds are positive,
 * spends negative, so the balance is the running sum. This is the audit
 * trail — money is drawn down "against the player's name" here.
 */
export type LedgerEntryType = 'deposit' | 'spend' | 'refund';

export interface LedgerEntry {
  id: string;
  memberId: string;
  type: LedgerEntryType;
  /** Signed pence: + credits the balance (deposit/refund), − debits it (spend). */
  amountPence: number;
  /** Balance in pence immediately after this entry was applied. */
  balanceAfterPence: number;
  description: string;
  /** Set when the entry relates to a session booking/cancellation. */
  sessionId?: string;
  /** Which session the money was for — the whole point of the activity list. */
  sessionLabel?: string;
  createdAt: string;
}

export type SessionFormat = 'social' | 'round_robin' | 'ladder' | 'box_league' | 'coached';
export type SessionStatus = 'upcoming' | 'in_progress' | 'completed' | 'cancelled';

export interface Session {
  id: string;
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:mm' */
  startTime: string;
  endTime: string;
  courts: number;
  /** Defaults to courts * playersPerCourt, editable. */
  capacity: number;
  format: SessionFormat;
  /** "Graded" — only these produce matches & move ratings. */
  affectsRating: boolean;
  skillMin?: number;
  skillMax?: number;
  /** 0 = free. */
  /** The MEMBER price on the session row. Display only where the audience is
   *  the club at large; for anything the signed-in person will actually pay, use
   *  yourPricePence. */
  pricePence: number;
  /** What the signed-in member would be charged: member vs non-member price, and
   *  0 when a free taster applies. Resolved server-side against auth.uid(). */
  yourPricePence?: number;
  /** True when this booking would use up their free taster. */
  tasterApplies?: boolean;
  /** null when signed out. */
  youAreMember?: boolean | null;
  /** ISO time a non-member may book, while the members-first window is still running. */
  youCanBookAt?: string | null;
  /** This member is a junior — a parent or guardian must be present. */
  guardianRequired?: boolean;
  /** Only players on the session's invite list can book it (migration 86). */
  inviteOnly?: boolean;
  /** On an invite-only session: whether the signed-in member is on the list. null otherwise. */
  youAreInvited?: boolean | null;
  isRecurring: boolean;
  bookings: Booking[];
  /** memberIds, in order. */
  waitlist: string[];
  status: SessionStatus;
  /** Whether the club is currently accepting bookings for this session. Separate from
   *  `status`: a future session can have booking closed (full, or the line-up is built). */
  bookingOpen?: boolean;
  /** When booking is SCHEDULED to open (ISO). Shown on view-only sessions at
   *  clubs running preview mode; absent means no go-live is set. */
  bookingOpensAt?: string | null;
  /** Stamped the first time booking opened (migration 37). Its absence is how the
   *  app tells "hasn't opened yet" from "was open, now closed" — different
   *  messages to a member deciding whether to check back. */
  bookingOpenedAt?: string | null;
  /** clubs.settings.booking_cutoff_hours: members can't book this close to the start (the
   *  session lock). 0 or absent = no lock. Admins can still book people in. */
  bookingCutoffHours?: number;
  /** Who's playing, with real names — populated on the live backend via the
   *  session_attendees function (players can't read the bookings table directly). */
  attendees?: SessionAttendee[];
  /** Venue / address, shown on the sessions showcase. */
  location?: string;
  /** Who is running the session, so members know who to tell about a late change. */
  host?: string;
}

export interface SessionAttendee {
  memberId: string;
  name: string;
  rating: number | null;
  status: BookingStatus;
  /** Queue position when status is 'waitlisted'. */
  waitlistPos?: number | null;
}

export type BookingStatus = 'booked' | 'waitlisted' | 'attended' | 'no_show' | 'cancelled';

export interface Booking {
  id: string;
  sessionId: string;
  memberId: string;
  status: BookingStatus;
  paidPence: number;
  refundedPence?: number;
  bookedAt: string;
}

/** Produced ONLY by graded sessions. */
export interface Match {
  id: string;
  sessionId: string;
  /** Replay order. */
  seq: number;
  team1: [string, string];
  team2: [string, string];
  score1: number;
  score2: number;
}

export interface CourtSlipRound {
  round: number;
  courts: { court: number; team1: [string, string]; team2: [string, string] }[];
  /** Players sitting this round out (when bookings aren't a multiple of court size). */
  resting?: string[];
}

export interface SportProfile {
  sport: string;
  playersPerCourt: number;
  terms: { session: string; court: string; slip: string; rating: string };
  formats: SessionFormat[];
  ratingEnabled: boolean;
}

export type Role = 'member' | 'admin';

/** Outcome of a cancellation, so the UI can explain what happened. */
export interface CancellationResult {
  refunded: boolean;
  refundPence: number;
  /** Name of the waitlisted member promoted into the freed spot, if any. */
  promotedMemberName?: string;
  /** Human-readable explanation of how the 24h policy applied. */
  policyNote: string;
}
