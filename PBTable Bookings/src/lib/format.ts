import { Session } from '@/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 2 Jul" — British short date. */
export function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateLong(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "19:00–21:00" */
export function formatTimeRange(session: Session): string {
  return `${session.startTime}–${session.endTime}`;
}

export function formatSessionWhen(session: Session): string {
  const today = new Date();
  const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const prefix = session.date === todayIso ? 'Today' : formatDate(session.date);
  return `${prefix}, ${formatTimeRange(session)}`;
}

export function formatRating(rating: number | undefined): string {
  return rating === undefined ? '—' : rating.toFixed(2);
}

export function skillBandLabel(session: Session): string | null {
  if (session.skillMin === undefined && session.skillMax === undefined) return null;
  if (session.skillMin !== undefined && session.skillMax !== undefined) {
    return `${session.skillMin.toFixed(1)}–${session.skillMax.toFixed(1)}`;
  }
  if (session.skillMin !== undefined) return `${session.skillMin.toFixed(1)}+`;
  return `up to ${session.skillMax?.toFixed(1)}`;
}

export function spotsLeft(session: Session): number {
  const active = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  return Math.max(0, session.capacity - active.length);
}

/** Pieces for the fixture-style date block: { day:'FRI', num:'15', mon:'AUG' } */
export function dateBlockParts(isoDate: string): { day: string; num: string; mon: string } {
  const d = new Date(`${isoDate}T00:00:00`);
  return {
    day: DAYS[d.getDay()].toUpperCase(),
    num: String(d.getDate()),
    mon: MONTHS[d.getMonth()].toUpperCase(),
  };
}

/** "Tonight" / "Tomorrow" / "In 3 days" / "Today" — the countdown chip on My Bookings. */
export function countdownLabel(session: Session): string | null {
  const now = new Date();
  const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const start = new Date(`${session.date}T${session.startTime || '19:00'}`);
  const days = Math.round((new Date(`${session.date}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000);
  if (days < 0) return null;
  if (days === 0) return start.getHours() >= 17 ? 'Tonight' : 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 13) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return `In ${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** Initials for the who's-playing avatars: "Sandra Jardine" → "SJ". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
