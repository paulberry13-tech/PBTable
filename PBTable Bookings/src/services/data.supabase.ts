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
  booking_opens_at?: string | null;
  booking_opened_at?: string | null;
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

function mapSession(r: SessionRow, kind: SessionKind, spots: Spots, mine: Booking[]): Session {
  // The caller's own bookings are real (so "you're booked" detection works);
  // the rest of the roster is anonymous placeholders up to the true booked
  // count (RLS hides other members' rows).
  const mineBooked = mine.filter((b) => b.status === 'booked' || b.status === 'attended');
  const placeholders = Math.max(0, spots.booked - mineBooked.length);
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
    yourPricePence: spots.yourPricePence,
    tasterApplies: spots.tasterApplies,
    youAreMember: spots.youAreMember,
    youCanBookAt: spots.youCanBookAt,
    guardianRequired: spots.guardianRequired,
    isRecurring: false,
    bookings,
    waitlist,
    status: sessionStatus(r),
    bookingOpen: !!r.booking_open,
    bookingOpensAt: r.booking_opens_at ?? null,
    bookingOpenedAt: r.booking_opened_at ?? null,
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

/** Per-session facts only the server can tell us: the true booked count (all
 *  bookings, not just the caller's) AND what THIS member would actually pay.
 *  The price matters — price_pennies on the session row is the MEMBER price, so a
 *  non-member shown that figure is quoted one price and charged another, and
 *  someone holding a free taster is quoted a fee they will not be charged.
 *  session_spots resolves both against auth.uid(), so it is always the caller's own. */
type Spots = { booked: number; yourPricePence: number; tasterApplies: boolean; youAreMember: boolean | null;
  youCanBookAt: string | null; guardianRequired: boolean };

async function bookedCounts(sessions: { id: string; kind: SessionKind }[]): Promise<Map<string, Spots>> {
  const counts = new Map<string, Spots>();
  await Promise.all(
    sessions.map(async ({ id, kind }) => {
      const { data } = await supabase.rpc('session_spots', { p_session_kind: kind, p_session_id: id });
      const d = (data ?? {}) as {
        booked?: number; your_price_pennies?: number; price_pennies?: number;
        taster_applies?: boolean; you_are_member?: boolean | null;
        you_can_book_at?: string | null; guardian_required?: boolean;
      };
      counts.set(id, {
        booked: d.booked ?? 0,
        yourPricePence: d.your_price_pennies ?? d.price_pennies ?? 0,
        tasterApplies: !!d.taster_applies,
        youAreMember: d.you_are_member ?? null,
        // Non-null while a non-member is still inside the members-first window.
        youCanBookAt: d.you_can_book_at ?? null,
        guardianRequired: !!d.guardian_required,
      });
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
  if (!uid) {
    // Signed out, browsing publicly: fall back to the club this HOSTNAME serves.
    // Without this the public session list is empty, because scoping is normally
    // done by the signed-in member's club. Reads still obey RLS — a visitor sees
    // exactly what the club's public dashboard already shows.
    const { data: club } = await supabase
      .from('clubs')
      .select('id')
      .eq('slug', BACKEND.slug)
      .maybeSingle();
    _clubId = (club as { id: string } | null)?.id ?? null;
    return _clubId;
  }
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
  type Row = { member_id: string; name: string; rating: number | null; status: SessionAttendee['status']; waitlist_pos: number | null };
  return (data as Row[]).map((r) => ({
    memberId: r.member_id,
    name: r.name,
    rating: r.rating ?? null,
    status: r.status,
    waitlistPos: r.waitlist_pos ?? null,
  }));
}

// --- sessions ----------------------------------------------------------------

/** Does this club show future sessions before booking opens? (migration 62's
 *  preview_upcoming). Cached per session like the branding read; fails CLOSED to
 *  today's behaviour, because a blip must not decide a club has opted in. */
let _preview: boolean | null = null;
async function clubPreviewUpcoming(): Promise<boolean> {
  if (_preview !== null) return _preview;
  const club = await myClubId();
  if (!club) return false;
  try {
    const { data, error } = await supabase.from('clubs').select('settings').eq('id', club).maybeSingle();
    _preview = !error && !!(data?.settings as { preview_upcoming?: boolean } | null)?.preview_upcoming;
  } catch {
    return false;
  }
  return _preview;
}

export async function getSessions(): Promise<Session[]> {
  // "Upcoming" means upcoming: only sessions from today onward. Past sessions that were
  // left booking_open shouldn't clutter the list.
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const club = await myClubId();
  if (!club) return [];
  // Preview clubs list future sessions before booking opens (view-only); RLS decides
  // what is actually visible either way, so the filter here is belt-and-braces for
  // clubs that have NOT opted in -- their behaviour stays byte-identical.
  const preview = await clubPreviewUpcoming();
  const cols = 'id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open,booking_opens_at,booking_opened_at,location';
  let socialQ = supabase.from('social_sessions').select(cols).eq('club_id', club).gte('played_on', today);
  let gradedQ = supabase.from('session_plans').select(cols + ',courts').eq('club_id', club).gte('played_on', today);
  if (!preview) {
    socialQ = socialQ.eq('booking_open', true);
    gradedQ = gradedQ.eq('booking_open', true);
  }
  const [social, graded] = await Promise.all([socialQ, gradedQ]);
  if (social.error) throw social.error;
  if (graded.error) throw graded.error;
  const rows: [SessionRow, SessionKind][] = [
    ...(social.data as unknown as SessionRow[]).map((r) => [r, 'social'] as [SessionRow, SessionKind]),
    ...(graded.data as unknown as SessionRow[]).map((r) => [r, 'graded'] as [SessionRow, SessionKind]),
  ];
  const [counts, mine] = await Promise.all([
    bookedCounts(rows.map(([r, kind]) => ({ id: r.id, kind }))),
    myBookingsForSessions(rows.map(([r]) => r.id)),
  ]);
  return rows
    .map(([r, kind]) => mapSession(r, kind, counts.get(r.id) ?? { booked: 0, yourPricePence: r.price_pennies ?? 0, tasterApplies: false, youAreMember: null, youCanBookAt: null, guardianRequired: false }, mine.get(r.id) ?? []))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

export async function getSession(id: string): Promise<Session> {
  // Scoped like the list above, so a session id from another club can't be opened
  // by deep-linking straight to /session/<id>.
  const club = await myClubId();
  if (!club) throw new Error('Not signed in.');
  const social = await supabase
    .from('social_sessions')
    .select('id,name,played_on,start_time,end_time,capacity,format,price_pennies,booking_open,booking_opens_at,booking_opened_at,location')
    .eq('id', id)
    .eq('club_id', club)
    .maybeSingle();
  const kind: SessionKind = social.data ? 'social' : 'graded';
  let row = social.data as SessionRow | null;
  if (!row) {
    const graded = await supabase
      .from('session_plans')
      .select('id,name,played_on,start_time,end_time,capacity,courts,format,price_pennies,booking_open,booking_opens_at,booking_opened_at,location')
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
  return { ...mapSession(row, kind, counts.get(id) ?? { booked: 0, yourPricePence: row.price_pennies ?? 0, tasterApplies: false, youAreMember: null, youCanBookAt: null, guardianRequired: false }, mine.get(id) ?? []), attendees };
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

type WalletRow = {
  id: number; created_at: string; reason: string; amount_pennies: number;
  session_kind: string | null; session_id: string | null;
  session_name: string | null; session_date: string | null;
  comp: boolean | null; taster: boolean | null;
};

// my_wallet_activity resolves which SESSION each entry was for. That cannot be done
// client-side: bookings is polymorphic (session_kind + session_id, pointing at either
// social_sessions or session_plans), so PostgREST has no relationship to embed.
// Without it every row read "Session booking" plus the date the money moved, which
// told a member nothing and made a balance impossible to reconcile.
export async function getLedger(memberId: string): Promise<LedgerEntry[]> {
  // NOTE: my_wallet_activity takes no argument — it is scoped server-side to
  // auth.uid(). `memberId` is only stamped onto the returned rows, so calling this
  // with anyone other than the signed-in member would label THEIR rows with
  // SOMEONE ELSE'S id. The only caller passes currentUser.id; keep it that way.
  const { data, error } = await supabase.rpc('my_wallet_activity');
  if (error) throw error;
  let running = 0;
  const rows = ((data ?? []) as WalletRow[]).map((r) => {
    running += r.amount_pennies;
    // A comp or a taster still writes a ledger row; say so rather than calling a
    // £0 line "Session booking" and leaving the member to wonder what they paid.
    const label =
      r.comp ? 'Comped place' : r.taster ? 'Free taster' : LEDGER_LABEL[r.reason] ?? r.reason;
    return {
      id: String(r.id),
      memberId,
      type: LEDGER_KIND[r.reason] ?? 'refund',
      amountPence: r.amount_pennies,
      balanceAfterPence: running,
      description: label,
      sessionId: r.session_id ?? undefined,
      sessionLabel: r.session_name
        ? r.session_date
          ? `${r.session_name} · ${formatSessionDate(r.session_date)}`
          : r.session_name
        : undefined,
      createdAt: r.created_at,
    } as LedgerEntry;
  });
  return rows.reverse();
}

// Short, unambiguous date for a ledger line: "Wed 26 Aug".
function formatSessionDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Can the club this hostname serves take card payments right now?
 *
 *  Three things have to be true and only the database knows all three: a Stripe
 *  account is connected, Stripe has enabled charges on it, and the club is in paid
 *  mode. The app cannot read any of them directly -- migration 47 keeps the Stripe
 *  columns private -- so it asks one purpose-built question instead.
 *
 *  This replaces guessing from the build. STRIPE_TOPUP was fixed at compile time
 *  and hard-wired to the demo, which is how a club site ended up showing a demo
 *  card form: the app was reasoning about which bundle it was, not about the club
 *  in front of it.
 *
 *  Cached for the session. It changes when an admin connects Stripe or switches
 *  mode, neither of which happens while a member is mid-top-up.
 */
/**
 * Recover the message an Edge Function actually sent.
 *
 * supabase-js turns any non-2xx into a FunctionsHttpError whose message is the
 * useless string "Edge Function returned a non-2xx status code", and hides the real
 * body on `error.context` -- an unread Response. Every carefully written error in
 * connect-topup and connect-topup-confirm was being thrown away, so a member who
 * needed to be told "this club is not set up to take card payments" got a stack
 * trace's worth of nothing instead.
 *
 * Also marks whether the failure is worth retrying. A 4xx other than 401 means the
 * request itself is wrong and will never succeed; 401 is usually a token mid-refresh
 * and 5xx is usually transient, so both are left retryable.
 */
async function fnError(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: Response } | null)?.context;
  let message: string | null = null;
  let status = 0;
  if (ctx && typeof ctx === 'object') {
    status = Number((ctx as Response).status) || 0;
    try {
      const body = await (ctx as Response).json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      /* not JSON, or already consumed -- fall through to the fallback */
    }
  }
  const raw = (error as { message?: string } | null)?.message;
  const out = new Error(message ?? (raw && !/non-2xx/i.test(raw) ? raw : fallback));
  (out as Error & { terminal?: boolean }).terminal = status >= 400 && status < 500 && status !== 401;
  return out;
}

let _takesPayments: boolean | null = null;
export type ClubBranding = {
  /** The club's display name, or null if it could not be read. */
  name: string | null;
  /** settings.logo_url, or null when the club has set none. */
  logoUrl: string | null;
};

/** The club's own name and logo, for the header. The app is embedded at /app on the
 *  club's site, so the CLUB is the brand and PBTable is the plumbing — a member should
 *  see the same identity here as on every other screen. Until now the header showed
 *  PBTable's logo and wordmark on every club.
 *
 *  Both come from `clubs`: `name` is a column, the logo lives at `settings.logo_url`
 *  (that is where the dashboard writes it — there is no logo_url column). Both stay
 *  readable by anon under migration 47's column list.
 *
 *  Cached for the session: it cannot change while the page is open, and the header
 *  renders on every screen. Any failure returns null and the PBTable mark is used,
 *  so a slow or broken lookup can never leave the header empty. */
let _branding: ClubBranding | null | undefined;
export async function getClubBranding(): Promise<ClubBranding | null> {
  if (_branding !== undefined) return _branding;
  try {
    const { data, error } = await supabase
      .from('clubs')
      .select('name,settings')
      .eq('slug', BACKEND.slug)
      .maybeSingle();
    // Do NOT cache a failure: one dropped request would pin the header to the
    // PBTable mark for the rest of the session, on every screen, even after the
    // connection came back. Only success is remembered.
    if (error || !data) return null;
    const row = data as { name?: string | null; settings?: Record<string, unknown> | null };
    const s = row.settings ?? {};
    const logo = typeof s.logo_url === 'string' && s.logo_url.trim() ? s.logo_url.trim() : null;
    _branding = { name: (row.name ?? '').trim() || null, logoUrl: logo };
  } catch {
    return null;   // transient — try again on the next mount rather than caching it
  }
  return _branding;
}

export async function clubTakesPayments(): Promise<boolean> {
  if (_takesPayments !== null) return _takesPayments;
  try {
    const { data, error } = await supabase.rpc('club_payments_enabled', { p_slug: BACKEND.slug });
    // Fails CLOSED. Not knowing must never open a payment path -- the alternative
    // is charging a member on a club that cannot receive it.
    _takesPayments = error ? false : !!data;
  } catch {
    _takesPayments = false;
  }
  return _takesPayments;
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

  // A CLUB payment: Stripe Checkout created on the club’s own connected account,
  // so the money lands with them and PBTable never holds it. Tried first, because
  // it is the only path that exists on a real club.
  if (await clubTakesPayments()) {
    const origin = Platform.OS === 'web' ? window.location.origin : '';
    const { data, error } = await supabase.functions.invoke('connect-topup', {
      // The slug says WHICH club this top-up is for. Without it the server has to
      // guess from the sign-in alone, which errors outright for anyone who belongs
      // to two clubs.
      body: { amount_pennies: amountPence, origin, slug: BACKEND.slug },
    });
    if (error) throw await fnError(error, 'Could not start the payment.');
    const url = (data as { url?: string })?.url;
    if (!url) throw new Error((data as { error?: string })?.error ?? 'Could not start the payment.');
    await Linking.openURL(url);
    return synthetic;
  }

  if (STRIPE_TOPUP) {
    // DEMO Stripe: the platform’s own test account, not Connect. Kept so the demo
    // site can still show the member payment journey end to end.
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
    if (error) throw await fnError(error, 'Could not start checkout.');
    const url = (data as { url?: string })?.url;
    if (!url) throw new Error((data as { error?: string })?.error ?? 'Could not start checkout.');
    await Linking.openURL(url);
    return synthetic;
  }

  // DEMO path: the `wallet-topup` Edge Function credits the wallet directly.
  const { data, error } = await supabase.functions.invoke('wallet-topup', {
    body: { amount_pennies: amountPence },
  });
  if (error) throw await fnError(error, 'Could not add credit.');
  return { ...synthetic, balanceAfterPence: (data as { balance_pence?: number })?.balance_pence ?? 0 };
}

/**
 * Confirm a card top-up when the member lands back from Stripe.
 *
 * The webhook is meant to do this, and it still runs. But a webhook only credits
 * if Stripe delivers it, and on 25 Aug 2026 a real payment on a real connected
 * account produced no delivery to any destination we could configure. Waiting to
 * be told left the member staring at a zero balance after paying.
 *
 * So the wallet page asks instead, using the checkout session id Stripe puts in
 * the return URL. Same ledger row, same idempotency key as the webhook, so the
 * two can both fire and only one credit lands.
 */
export type TopUpReconciliation = {
  /** Pennies actually added to the balance by this call — named session plus sweep. */
  creditedPence: number;
  /** The named payment exists but Stripe has not settled it yet. Keep the claim. */
  pending: boolean;
  /** Paid sessions declined because the money had been refunded or charged back. */
  reversed: number;
  /** The sweep hit its page cap, so older payments were NOT examined. */
  truncated: boolean;
};

export async function confirmTopUp(sessionId?: string | null): Promise<TopUpReconciliation> {
  const { data, error } = await supabase.functions.invoke('connect-topup-confirm', {
    // session_id omitted entirely when there is no reference: the function then
    // sweeps, which is the whole point of calling it on an ordinary wallet visit.
    body: { slug: BACKEND.slug, ...(sessionId ? { session_id: sessionId } : {}) },
  });
  if (error) throw await fnError(error, 'Could not confirm your payment.');
  const r = data as {
    ok?: boolean; error?: string; credited?: boolean; pending?: boolean;
    amount_pennies?: number; swept_pennies?: number; reversed?: number; truncated?: boolean;
  };
  if (!r?.ok) throw new Error(r?.error ?? 'Could not confirm your payment.');
  return {
    creditedPence: (r.credited ? r.amount_pennies ?? 0 : 0) + (r.swept_pennies ?? 0),
    pending: !!r.pending,
    reversed: r.reversed ?? 0,
    truncated: !!r.truncated,
  };
}

// --- members & leaderboard ---------------------------------------------------

type StandingRow = { pos: number; name: string; rating: number; games: number };

export async function getMembers(): Promise<Member[]> {
  const club = await myClubId();
  if (!club) return [];
  // NAMES ONLY. This used to merge private.rdr_standings -- a cached SECOND
  // implementation of the rating engine, which on Swindon disagreed with the public
  // leaderboard by up to 0.015 for eight of ninety-eight players. The browser's
  // replayAllSessions is the one true calculation and is what the club site shows;
  // nothing here may put a different number in front of a member.
  // (Paul, 2026-08-27: "All they need to see is who is playing.")
  const { data: players, error } = await supabase
    .from('players').select('id,name,guest').eq('club_id', club).order('name', { ascending: true });
  if (error) throw error;
  return (players as { id: string; name: string; guest: boolean }[]).map((p) => ({
    id: p.id,
    name: p.name,
    email: '',
    memberType: p.guest ? 'guest' : 'member',
    ratingState: 'unrated' as const,
    rating: undefined,
    gradedGames: 0,
    balancePence: 0,
  }));
}

export async function getMember(id: string): Promise<Member> {
  const m = (await getMembers()).find((x) => x.id === id);
  if (!m) throw new Error('Member not found');
  return m;
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
