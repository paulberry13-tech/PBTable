import { Session } from '@/types';

/**
 * THE single 24-hour cancellation policy function.
 *
 * - More than 24h before start: full refund, spot released, first
 *   waitlister auto-promoted.
 * - Within 24h of start: cancel allowed, NO automatic refund — UNLESS a
 *   waitlister takes the freed spot (the seat was re-sold), in which case
 *   the original booker is refunded after all.
 */

export interface CancellationDecision {
  allowed: true;
  withinCutoff: boolean;
  /** Refund immediately (outside 24h). */
  refundNow: boolean;
  /** Refund only if a waitlister fills the seat (inside 24h). */
  refundIfResold: boolean;
}

export const CANCELLATION_CUTOFF_HOURS = 24;

export function sessionStart(session: Session): Date {
  return new Date(`${session.date}T${session.startTime}:00`);
}

export function hoursUntilStart(session: Session, now: Date = new Date()): number {
  return (sessionStart(session).getTime() - now.getTime()) / 3_600_000;
}

export function decideCancellation(session: Session, now: Date = new Date()): CancellationDecision {
  const withinCutoff = hoursUntilStart(session, now) < CANCELLATION_CUTOFF_HOURS;
  return {
    allowed: true,
    withinCutoff,
    refundNow: !withinCutoff,
    refundIfResold: withinCutoff,
  };
}

/** UI copy explaining what cancelling now would mean, before the user confirms. */
export function cancellationWarning(session: Session, pricePaidPence: number): string {
  const d = decideCancellation(session);
  if (pricePaidPence === 0) return 'This was a free booking — your spot will be released.';
  if (!d.withinCutoff) {
    return 'More than 24 hours before start — the money goes straight back to your balance.';
  }
  return (
    'This session starts in under 24 hours, so no automatic refund applies. ' +
    'If someone from the waitlist takes your spot, the money is returned to your balance in full.'
  );
}
