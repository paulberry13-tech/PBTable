import { CourtSlipRound, Member, Session } from '@/types';
import { UNRATED_CALC_RATING } from '@/domain/ratings';

/**
 * Balanced court slips — the PBTable differentiator.
 *
 * Approach per round:
 *  1. Order booked players by rating (unrated players get an ESTIMATED level
 *     for slip-making only — the session's skill-band midpoint, else 3.0 —
 *     never recorded as a rating).
 *  2. Rotate who rests (when not a multiple of the court size).
 *  3. Cut the ordered list into court-sized blocks so each court is
 *     competitive (similar overall level).
 *  4. Within each block of four, pick the team split that (a) avoids
 *     repeating partners from earlier rounds, then (b) keeps the two team
 *     averages closest — the strongest is usually paired with the weakest.
 */

const PAIRINGS: [number, number, number, number][] = [
  // [t1a, t1b, t2a, t2b] index splits of a sorted block [0=strongest..3=weakest]
  [0, 3, 1, 2],
  [0, 2, 1, 3],
  [0, 1, 2, 3],
];

export function slipRating(member: Member, session: Session): number {
  if (member.rating !== undefined) return member.rating;
  if (session.skillMin !== undefined && session.skillMax !== undefined) {
    return (session.skillMin + session.skillMax) / 2;
  }
  return session.skillMin ?? session.skillMax ?? UNRATED_CALC_RATING;
}

export function generateSlips(
  session: Session,
  players: Member[],
  rounds: number,
  playersPerCourt: number
): CourtSlipRound[] {
  const teamSize = Math.max(1, Math.floor(playersPerCourt / 2));
  const blockSize = teamSize * 2;
  const rated = new Map(players.map((p) => [p.id, slipRating(p, session)]));
  const partnerCounts = new Map<string, number>(); // "idA|idB" sorted key -> times partnered
  const restCounts = new Map<string, number>(players.map((p) => [p.id, 0]));

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const partnered = (a: string, b: string) => partnerCounts.get(pairKey(a, b)) ?? 0;

  const out: CourtSlipRound[] = [];
  for (let r = 0; r < rounds; r += 1) {
    // Who rests this round: fewest rests first, then weakest bias avoided by rotating.
    const restCount = players.length % blockSize;
    const byRest = [...players].sort(
      (a, b) => (restCounts.get(a.id) ?? 0) - (restCounts.get(b.id) ?? 0)
    );
    const resting = restCount > 0 ? byRest.slice(byRest.length - restCount) : [];
    resting.forEach((p) => restCounts.set(p.id, (restCounts.get(p.id) ?? 0) + 1));
    const restingIds = new Set(resting.map((p) => p.id));

    const active = players
      .filter((p) => !restingIds.has(p.id))
      .sort((a, b) => (rated.get(b.id) ?? 0) - (rated.get(a.id) ?? 0));

    // Small deterministic shuffle between rounds so court make-up varies:
    // swap neighbours at alternating offsets.
    if (r > 0) {
      for (let i = (r % 2) + 1; i + 1 < active.length; i += 3) {
        [active[i], active[i + 1]] = [active[i + 1], active[i]];
      }
    }

    const courts: CourtSlipRound['courts'] = [];
    const usableCourts = Math.min(session.courts, Math.floor(active.length / blockSize));
    for (let c = 0; c < usableCourts; c += 1) {
      const block = active.slice(c * blockSize, (c + 1) * blockSize);
      if (block.length < 4) break;
      // Score each candidate split: repeated partners weigh far more than balance.
      let best = PAIRINGS[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const p of PAIRINGS) {
        const [a1, a2, b1, b2] = p.map((i) => block[i]);
        const repeats = partnered(a1.id, a2.id) + partnered(b1.id, b2.id);
        const avg1 = ((rated.get(a1.id) ?? 0) + (rated.get(a2.id) ?? 0)) / 2;
        const avg2 = ((rated.get(b1.id) ?? 0) + (rated.get(b2.id) ?? 0)) / 2;
        const score = repeats * 10 + Math.abs(avg1 - avg2);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
      const [t1a, t1b, t2a, t2b] = best.map((i) => block[i]);
      partnerCounts.set(pairKey(t1a.id, t1b.id), partnered(t1a.id, t1b.id) + 1);
      partnerCounts.set(pairKey(t2a.id, t2b.id), partnered(t2a.id, t2b.id) + 1);
      courts.push({ court: c + 1, team1: [t1a.id, t1b.id], team2: [t2a.id, t2b.id] });
    }

    out.push({ round: r + 1, courts, resting: resting.map((p) => p.id) });
  }
  return out;
}
