import { SportProfile } from '@/types';

/**
 * Sport profiles drive terminology and court capacity so the same core
 * works for other sports. Pickleball is the shipped default.
 */
export const PICKLEBALL: SportProfile = {
  sport: 'pickleball',
  playersPerCourt: 4,
  terms: { session: 'Session', court: 'Court', slip: 'Court slip', rating: 'RDR' },
  formats: ['social', 'round_robin', 'ladder', 'box_league', 'coached'],
  ratingEnabled: true,
};

/** Proof that terminology/capacity adapt — toggle in the app header. */
export const TENNIS: SportProfile = {
  sport: 'tennis',
  playersPerCourt: 4,
  terms: { session: 'Fixture', court: 'Court', slip: 'Match card', rating: 'Club rating' },
  formats: ['social', 'round_robin', 'ladder', 'coached'],
  ratingEnabled: true,
};

export const SPORT_PROFILES: SportProfile[] = [PICKLEBALL, TENNIS];

export const FORMAT_LABELS: Record<string, string> = {
  social: 'Social',
  round_robin: 'Round robin',
  ladder: 'Ladder',
  box_league: 'Box league',
  coached: 'Coached',
};
