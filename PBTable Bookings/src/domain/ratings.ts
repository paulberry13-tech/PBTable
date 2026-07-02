import { Match, Member } from '@/types';

/**
 * RDR (Rally Doubles Rating) update — an ELO-family doubles update.
 * Simplified but real, so the demo loop is live.
 */

export const RATING_FLOOR = 2.0;
export const RATING_CEIL = 8.0;
/** Used in calculations for players with no rating — never recorded. */
export const UNRATED_CALC_RATING = 3.0;
/** Logistic divisor tuned for the 2.0–8.0 scale. */
const D = 1.1;
/** Graded games needed to move unrated → provisional → rated. */
export const PROVISIONAL_AT = 1;
export const RATED_AT = 6;

const clamp = (r: number) => Math.min(RATING_CEIL, Math.max(RATING_FLOOR, r));

/** Dynamic K: new players move fast (~0.12), settled players slowly (~0.04). */
export function kFactor(gradedGames: number): number {
  const t = Math.min(1, gradedGames / 20);
  return 0.12 - t * 0.08;
}

export function effectiveRating(m: Member): number {
  return m.rating ?? UNRATED_CALC_RATING;
}

export function expectedScore(teamRating1: number, teamRating2: number): number {
  return 1 / (1 + Math.pow(10, (teamRating2 - teamRating1) / D));
}

export interface RatingChange {
  memberId: string;
  before?: number;
  after: number;
  delta: number;
}

/**
 * Applies one graded game to the four players. Mutates the passed Member
 * objects (rating, gradedGames, state, streak, winRate, ratingHistory) and
 * returns per-player deltas for display.
 */
export function applyMatch(
  match: Match,
  membersById: Map<string, Member>,
  matchDate: string
): RatingChange[] {
  const t1 = match.team1.map((id) => membersById.get(id)).filter((m): m is Member => !!m);
  const t2 = match.team2.map((id) => membersById.get(id)).filter((m): m is Member => !!m);
  if (t1.length !== 2 || t2.length !== 2) return [];
  const total = match.score1 + match.score2;
  if (total <= 0) return [];

  const teamRating1 = (effectiveRating(t1[0]) + effectiveRating(t1[1])) / 2;
  const teamRating2 = (effectiveRating(t2[0]) + effectiveRating(t2[1])) / 2;
  const expected1 = expectedScore(teamRating1, teamRating2);
  const actual1 = match.score1 / total;
  const marginFactor = 1 + 0.5 * (1 - Math.exp(-Math.abs(match.score1 - match.score2) / 4));

  const changes: RatingChange[] = [];
  const apply = (m: Member, actual: number, expected: number, won: boolean) => {
    const k = kFactor(m.gradedGames);
    const delta = k * marginFactor * (actual - expected);
    const before = m.rating;
    const after = clamp(effectiveRating(m) + delta);

    m.rating = Math.round(after * 100) / 100;
    m.gradedGames += 1;
    if (m.ratingState === 'unrated' && m.gradedGames >= PROVISIONAL_AT) m.ratingState = 'provisional';
    if (m.ratingState === 'provisional' && m.gradedGames >= RATED_AT) m.ratingState = 'rated';

    // Streak: positive run of wins, negative run of losses.
    const s = m.streak ?? 0;
    m.streak = won ? (s > 0 ? s + 1 : 1) : s < 0 ? s - 1 : -1;

    // Incremental win rate over graded games.
    const prevWins = Math.round((m.winRate ?? 0) * (m.gradedGames - 1));
    m.winRate = Math.round(((prevWins + (won ? 1 : 0)) / m.gradedGames) * 100) / 100;

    m.ratingHistory = [...(m.ratingHistory ?? []), { date: matchDate, rating: m.rating }];
    changes.push({ memberId: m.id, before, after: m.rating, delta: m.rating - (before ?? UNRATED_CALC_RATING) });
  };

  const team1Won = match.score1 > match.score2;
  t1.forEach((m) => apply(m, actual1, expected1, team1Won));
  t2.forEach((m) => apply(m, 1 - actual1, 1 - expected1, !team1Won));
  return changes;
}
