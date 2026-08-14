// Supabase implementation of the data seam — mapped to the backend in the PB
// Table Demo project (booking_members, credits_ledger, polymorphic bookings,
// book_spot / cancel_booking / rdr_leaderboard, server-side RDR engine).
//
// Member flows (browse, book, cancel, wallet, leaderboard) are wired. Admin /
// engine flows (create session, slips, enter scores) reuse the existing web
// planner and are stubbed here.

import { Linking, Platform } from 'react-native';

import { BACKEND } from '@/services/backend';
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
  SessionAttendee,
  SessionStatus,
} from '@/types';
import type {
  BookResult,
  CancelSessionResult,
  CreateSessionInput,
  LeaderboardEntry,
  MyBooking,
  RemoveBookingResult,
  RosterEntry,
} from '@/services/data.mock';
import type { RatingChange } from '@/domain/ratings';

export { InsufficientBalanceError };

/** Whose leaderboard we show. Comes from the hostname (backend.ts) so one built
 *  bundle serves demo and every club subdomain. Slug-drift resilience lives in the
 *  demo's rdr_leaderboard (single-tenant: it returns the one club's standings
 *  regardless of the slug passed), so the client just passes the resolved slug.
 *  Everything else scopes by the signed-in member's club_id — see myClubId. */
const CLUB_SLUG = BACKEND.slug;

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
  location?: string | null;
};

/** Whether the session has happened — derived from ITS DATE AND TIME, never from
 *  `booking_open`. The two are orthogonal: an admin closes booking as soon as the
 *  line-up is built or the session fills, which is normal and says nothing about
 *  whether the night has been played. Deriving status from `booking_open` moved a
 *  member's still-upcoming booking into "Past" the moment the admin closed it. */
function sessionStatus(r: SessionRow): SessionStatus {
  const startAt = new Date(`${r.played_on}T${r.start_time ?? '19:00'}`);
  let endAt = new Date(`${r.played_on}T${r.end_time ?? '21:00'}`);
  // An unparseable date shouldn't hide a session — treat it as still to come.
  if (Number.isNaN(startAt.getTime())) return 'upcoming';
  // Missing/!nonsense end time (or one before the start): assume a two-hour session.
  if (Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  }
  const now = new Date();
  if (now >= endAt) return 'completed';
  if (now >= startAt) return 'in_progress';
  return 'upcoming';
}

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
    status: sessionStatus(r),
    bookingOpen: !!r.booking_open,
    location: r.location ?? undefined,
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

/** The signed-in member's club id. EVERY session and player read must be scoped by
 *  this: the tables hold every club's rows, so an unscoped read shows a member other
 *  clubs' sessions — which book_spot would then refuse anyway. Invisible on a
 *  single-club backend like the demo; wrong the moment a second club takes up booking.
 *  Cached per sign-in and cleared on any auth change, so switching accounts can't
 *  carry the previous member's club across. */
let _clubId: string | null = null;
supabase.auth.onAuthStateChange(() => {
  _clubId = null;
});

async function myClubId(): Promise<string | null> {
  if (_clubId) return _clubId;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('booking_members')
    .select('club_id')
    .eq('auth_user_id', uid)
    .maybeSingle();
  _clubId = (data as { club_id: string } | null)?.club_id ?? null;
  return _clubId;
}

async function resolveKind(sessionId: string): Promise<SessionKind> {
  const club = await myClubId();
  if (!club) return 'graded';
  const social = await supabase
    .from('social_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('club_id', club)
    .maybeSingle();
  return social.data ? 'social' : 'graded';
}

/** Who's playing, with real names — via the session_attendees function (members
 *  can't read the bookings table directly, so the roster would otherwise be
 *  anonymous). Degrades to empty on error. */
async function fetchAttendees(kind: SessionKind, sessionId: string): Promise<SessionAttendee[]> {
  const { data, error } = await supabase.rpc('session_attendees', {
    p_session_kind: kind,
    p_session_id: sessionId,
  });
  if (error || !data) return [];
  type Row = { member_id: string; name: string; rating: number | null; status: SessionAttendee['status'] };
  return (data as Row[]).map((r) => ({
    memberId: r.member_id,
    name: r.name,
    rating: r.rating ?? null,
    status: r.status,
  }));
}

// --- sessions ----------------------------------------------------------------

export async function getSessions(): Promise<Session[]> {
  // "Upcoming" means upcoming: only sessions from today onward. Past sessions that were
  // left booking_open shouldn't clutter the list.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const club = await myClubId();
  if (!club) return [];
  const [social, graded] = await Promise.all([
    supabase
      .from('social_sessions')
      .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open,location')
      .eq('club_id', club)
      .eq('booking_open', true)
      .gte('played_on', today),
    supabase
      .from('session_plans')
      .select('id,name,played_on,start_time,end_time,capacity,courts,format,price_pennies,booking_open,location')
      .eq('club_id', club)
      .eq('booking_open', true)
      .gte('played_on', today),
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
  // Scoped like the list above, so a session id from another club can't be opened
  // by deep-linking straight to /session/<id>.
  const club = await myClubId();
  if (!club) throw new Error('Not signed in.');
  const social = await supabase
    .from('social_sessions')
    .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open,location')
    .eq('id', id)
    .eq('club_id', club)
    .maybeSingle();
  const kind: SessionKind = social.data ? 'social' : 'graded';
  let row = social.data as SessionRow | null;
  if (!row) {
    const graded = await supabase
      .from('session_plans')
      .select('id,name,played_on,start_time,end_time,capacity,courts,format,price_pennies,booking_open,location')
      .eq('id', id)
      .eq('club_id', club)
      .single();
    if (graded.error) throw graded.error;
    row = graded.data as SessionRow;
  }
  const [counts, mine, attendees] = await Promise.all([
    bookedCounts([{ id, kind }]),
    myBookingsForSessions([id]),
    fetchAttendees(kind, id),
  ]);
  return { ...mapSession(row, kind, counts.get(id) ?? 0, mine.get(id) ?? []), attendees };
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const kind: SessionKind = input.affectsRating ? 'graded' : 'social';
  const { data, error } = await supabase.rpc('admin_create_session', {
    p_session_kind: kind,
    p_name: input.title,
    p_played_on: input.date,
    p_start: input.startTime,
    p_end: input.endTime,
    p_capacity: input.capacity,
    p_price_pennies: input.pricePence,
    p_courts: input.courts,
    p_format: input.format,
    p_recurrence: input.isRecurring ? 'weekly' : 'none',
    p_weeks: input.recurrenceWeeks ?? 8,
  });
  if (error) throw error;
  const firstId = (data as { session_ids?: string[] } | null)?.session_ids?.[0];
  if (!firstId) throw new Error('The session could not be created.');
  return getSession(firstId);
}

export async function demoFillSession(_sessionId: string): Promise<number> {
  return notBuiltYet('Demo-filling a session');
}

// --- admin session management (SECURITY DEFINER RPCs, club_admin only) --------

/** The balanced-planner roster: a session's paid attendees resolved to their
 *  linked player + live RDR rating (via the session_roster bridge), strongest
 *  first. Works for social and graded sessions. */
export async function getSessionRoster(sessionId: string): Promise<RosterEntry[]> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('session_roster', {
    p_session_kind: kind,
    p_session_id: sessionId,
  });
  if (error) throw error;
  type RosterRow = {
    member_id: string;
    name: string;
    rating: number | null;
    slip_rating: number;
    status: RosterEntry['status'];
  };
  return ((data as RosterRow[] | null) ?? []).map((r) => ({
    memberId: r.member_id,
    name: r.name,
    rating: r.rating ?? null,
    slipRating: r.slip_rating,
    status: r.status,
  }));
}

/** Cancel a session and refund every booked attendee to their wallet. */
export async function adminCancelSession(sessionId: string): Promise<CancelSessionResult> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('admin_cancel_session', {
    p_session_kind: kind,
    p_session_id: sessionId,
  });
  if (error) throw error;
  const r = (data as { attendees_refunded?: number; total_refund_pennies?: number } | null) ?? {};
  return {
    attendeesRefunded: r.attendees_refunded ?? 0,
    totalRefundPence: r.total_refund_pennies ?? 0,
  };
}

/** Remove one player from a session, refund them, and promote the first
 *  affordable waitlister into the freed spot. */
export async function adminRemoveBooking(
  sessionId: string,
  memberId: string
): Promise<RemoveBookingResult> {
  const kind = await resolveKind(sessionId);
  const { data, error } = await supabase.rpc('admin_remove_booking', {
    p_session_kind: kind,
    p_session_id: sessionId,
    p_member_id: memberId,
  });
  if (error) throw error;
  const r =
    (data as { removed?: boolean; refund_pennies?: number; promoted_name?: string | null } | null) ?? {};
  return {
    removed: r.removed ?? false,
    refundPence: r.refund_pennies ?? 0,
    promotedName: r.promoted_name ?? null,
  };
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
    // Return the member to the exact app page they launched top-up from, so the
    // whole round-trip stays inside the app — works whether it's hosted at the
    // domain root or mounted under /app on the club site.
    const returnUrl =
      Platform.OS === 'web'
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://demo.pbtable.com/wallet';
    const { data, error } = await supabase.functions.invoke('create-topup-checkout', {
      body: {
        amount_pennies: amountPence,
        success_url: `${returnUrl}?topup=success`,
        cancel_url: `${returnUrl}?topup=cancelled`,
      },
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
  const club = await myClubId();
  if (!club) return [];
  const [{ data: players, error }, ranks] = await Promise.all([
    supabase.from('players').select('id,name,guest').eq('club_id', club).order('name', { ascending: true }),
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
  const club = await myClubId();
  const [ranks, { data: players }] = await Promise.all([
    standings(),
    club ? supabase.from('players').select('id,name').eq('club_id', club) : Promise.resolve({ data: [] }),
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
