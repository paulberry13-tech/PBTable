// What cancelling a booking right now will mean, in the member's words -- shown BEFORE they confirm.
//
// It must say exactly what the server will do, so it mirrors public.cancel_booking and
// private.promotion_allowed (production, 2026-09-13):
//
//   * a waitlist place:                 leave the list, nothing charged
//   * the club isn't taking payment:    place released, nothing charged
//   * a free booking:                   place released
//   * at or before the cancel cut-off   refunded to the wallet
//     (settings.cancel_cutoff_hours, default 24)
//   * inside the cut-off, not locked:   no automatic refund -- refunded only if someone from the
//                                       waiting list is moved into the place
//   * inside the lock                   nobody can be moved in, so no refund at all
//     (settings.promote_cutoff_hours, default 3; 0 = no lock)
//
// The old wording was a fixed sentence promising a refund "if a waitlister takes your spot", which
// the lock (migration 67, set per club from the dashboard) makes impossible. At Swindon the lock and
// the cut-off are both 24 hours, so inside 24 hours the promise was always false.
//
// Deliberately free of imports so it can be exercised on its own.

export interface CancelNoticeInput {
  /** Hours from now until the session starts (can be negative). */
  hoursUntilStart: number;
  /** clubs.settings.cancel_cutoff_hours, or undefined when unset. */
  cancelCutoffHours?: number | null;
  /** clubs.settings.promote_cutoff_hours, or undefined when unset. */
  promoteCutoffHours?: number | null;
  /** What this member paid for the booking, in pence. */
  pricePence: number;
  /** clubs.settings.booking_mode; anything but 'paid' takes no money. */
  bookingMode?: string | null;
  waitlisted?: boolean;
}

export type CancelNoticeKind = 'waitlist' | 'unpaid' | 'free' | 'refund' | 'refund_if_taken' | 'locked';

export interface CancelNotice {
  kind: CancelNoticeKind;
  text: string;
}

const DEFAULT_CANCEL_CUTOFF = 24;
const DEFAULT_PROMOTE_CUTOFF = 3;

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function hoursText(h: number): string {
  const n = Number.isInteger(h) ? String(h) : String(Math.round(h * 10) / 10);
  return `${n} hour${h === 1 ? '' : 's'}`;
}

function money(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export function cancelNotice(input: CancelNoticeInput): CancelNotice {
  if (input.waitlisted) {
    return { kind: 'waitlist', text: "You'll leave the waiting list. Nothing has been charged." };
  }
  if ((input.bookingMode ?? 'paid') !== 'paid') {
    return { kind: 'unpaid', text: 'Your place will be released. Nothing was charged.' };
  }
  if (!(input.pricePence > 0)) {
    return { kind: 'free', text: 'This was a free booking. Your place will be released.' };
  }
  const cutoff = num(input.cancelCutoffHours, DEFAULT_CANCEL_CUTOFF);
  const lock = num(input.promoteCutoffHours, DEFAULT_PROMOTE_CUTOFF);
  const h = input.hoursUntilStart;
  const paid = money(input.pricePence);

  // Same comparisons as the server: refund when hours >= cut-off; promotion only when hours >= lock.
  if (h >= cutoff) {
    return {
      kind: 'refund',
      text: `It's more than ${hoursText(cutoff)} before the start, so your ${paid} goes back to your balance.`,
    };
  }
  if (h < lock) {
    return {
      kind: 'locked',
      text:
        `This session is locked: it starts in less than ${hoursText(lock)}, so nobody can take your place. ` +
        `If you cancel, you won't get your ${paid} back.`,
    };
  }
  return {
    kind: 'refund_if_taken',
    text:
      `It's less than ${hoursText(cutoff)} before the start, so there's no automatic refund. ` +
      `If someone from the waiting list takes your place, your ${paid} goes back to your balance.`,
  };
}

/** Hours from `now` until a session starting at `date` ('YYYY-MM-DD') and `time` ('HH:mm') UK time.
 *  The server reads start times in Europe/London, so the app must too -- a member abroad, or a device
 *  clock in another zone, would otherwise be told the wrong side of a cut-off. Falls back to the
 *  device's own time zone only if the platform has no time-zone support. */
export function hoursUntilLondonStart(date: string, time: string, now: Date = new Date()): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = (time && /^\d{1,2}:\d{2}/.test(time) ? time : '19:00').split(':').map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, hh, mm);
  let startMs = wallAsUtc;
  try {
    // London's offset from UTC at that moment (0 in winter, +1h in summer). Two passes settle the
    // hour either side of a clock change.
    for (let i = 0; i < 2; i++) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date(startMs));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const shownAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
      startMs = wallAsUtc - (shownAsUtc - startMs);
    }
  } catch {
    startMs = new Date(y, mo - 1, d, hh, mm).getTime();
  }
  return (startMs - now.getTime()) / 3_600_000;
}
