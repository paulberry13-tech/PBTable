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
  pricePence: number;
  isRecurring: boolean;
  bookings: Booking[];
  /** memberIds, in order. */
  waitlist: string[];
  status: SessionStatus;
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
