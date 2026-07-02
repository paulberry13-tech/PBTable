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
