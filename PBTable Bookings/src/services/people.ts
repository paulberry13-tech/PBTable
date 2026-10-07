// The people a login looks after at this club -- themselves and any children -- and the
// details the club keeps about each (migration 94).
//
// WHY THESE ARE FUNCTIONS, NOT TABLE READS. Emergency contacts and health notes live in the
// database's private schema, where nothing can read them except functions that check who is
// asking. A member reaches their own and their children's; an admin with the emergency-info
// permission reaches them on a session night, and every look is logged.
//
// What joining online REQUIRES (Paul, 2026-10-02): phone, date of birth, an emergency contact,
// the club's code of conduct (when it has one) and the privacy notice. Health notes are
// optional and are kept only with explicit consent. The database enforces all of it; the
// form checks the same things first so a member sees what is missing before they submit.

import { BACKEND } from '@/services/backend';
import { hostClubId } from '@/services/hostClub';
import { supabase } from '@/services/supabaseClient';

export type MemberDetails = {
  date_of_birth: string | null;          // YYYY-MM-DD
  phone: string | null;
  postcode: string | null;
  emergency1_name: string | null;
  emergency1_relationship: string | null;
  emergency1_phone: string | null;
  emergency2_name: string | null;
  emergency2_relationship: string | null;
  emergency2_phone: string | null;
  medical_notes: string | null;
  medical_consent: boolean;
  privacy_consent: boolean;
  conduct_accepted: boolean;
  photo_consent: boolean | null;
  marketing_opt_in: boolean | null;
  /** Agreed to their details being passed on to register a membership (migration 94, section
   *  12). Optional here; buying a membership asks for it on the membership card. */
  share_consent: boolean;
  /** Section 17: false when an admin ticked it from a paper form; the member confirms it. */
  share_confirmed?: boolean;
  // 2026-10-06: what other clubs ask for. All optional.
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  phone2: string | null;
  play_level: PlayLevel | null;
  dupr_id: string | null;
  pe_number: string | null;
  interests: Interest[] | null;
  junior_first_aid: boolean | null;
  junior_leave_alone: boolean | null;
  junior_collect_by: string | null;
  // Health: kept only with medical_consent, like medical_notes ("anything else").
  medical_conditions: string | null;
  allergies: string | null;
  medication: string | null;
  adjustments: string | null;
};

export type PlayLevel = 'new' | 'beginner' | 'intermediate' | 'advanced';
export type Interest = 'social' | 'competitive' | 'coaching' | 'volunteering';
export const PLAY_LEVELS: [PlayLevel, string][] = [
  ['new', 'New to pickleball'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'],
];
export const INTERESTS: [Interest, string][] = [
  ['social', 'Social play'], ['competitive', 'Competitive / graded'], ['coaching', 'Coaching'], ['volunteering', 'Helping the club'],
];

export const EMPTY_DETAILS: MemberDetails = {
  date_of_birth: null, phone: null, postcode: null,
  emergency1_name: null, emergency1_relationship: null, emergency1_phone: null,
  emergency2_name: null, emergency2_relationship: null, emergency2_phone: null,
  medical_notes: null, medical_consent: false, privacy_consent: false, conduct_accepted: false,
  photo_consent: null, marketing_opt_in: null, share_consent: false,
  first_name: null, last_name: null, address_line1: null, address_line2: null, town: null, phone2: null,
  play_level: null, dupr_id: null, pe_number: null, interests: null,
  junior_first_aid: null, junior_leave_alone: null, junior_collect_by: null,
  medical_conditions: null, allergies: null, medication: null, adjustments: null,
};

export type PersonMembership = {
  id: string;
  status: string;
  source: 'stripe' | 'offline';
  current_period_end: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  i_pay: boolean;
  /** A payment above £0 has gone through (migration 94, section 11). Until then renewal stays
   *  on: a December joiner pays on 1 January. Absent on a backend before that change. */
  first_payment_made?: boolean;
  plan_id: string | null;
  plan_name: string | null;
  price_pennies: number | null;
  billing_mode: 'calendar' | 'anniversary' | null;
  /** The current period in UK days, first and last day covered (YYYY-MM-DD). Absent on a
   *  backend before 94f; the card then falls back to the end date alone. */
  period_from?: string | null;
  period_to?: string | null;
  /** A card subscription stands behind it (94, section 14). False for paid-to-the-club, imported
   *  or hand-made ones: then "Update card" has nothing to open. */
  has_card?: boolean;
  /** It can be renewed by card early: no card behind it, ending within a year. */
  renewable_by_card?: boolean;
};

export type Person = {
  player_id: string;
  name: string;
  self: boolean;
  is_minor: boolean;
  gender: string | null;
  details: (MemberDetails & { updated_at?: string }) | null;
  details_complete: boolean;
  membership: PersonMembership | null;
};

export type ClubJoinInfo = {
  club_name: string;
  self_signup: boolean;
  code_of_conduct_url: string | null;
  privacy_notice_url: string | null;
  /** The "pass my details on" wording (section 12). Absent on a backend before it. */
  share_wording?: string | null;
  /** False when the club has switched off "add someone you look after" (section 20). */
  dependants?: boolean;
  memberships: {
    billing_mode: 'calendar' | 'anniversary' | null;
    types: { id: string; name: string; price_pennies: number; description: string | null }[];
  } | null;
};

/** A message a person can act on, from a database refusal. */
export function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('required: date_of_birth')) return 'Please add a date of birth.';
  if (m.includes('required: phone')) return 'Please add a phone number.';
  if (m.includes('required: emergency_contact')) return 'Please add an emergency contact: name, relationship and phone.';
  if (m.includes('required: privacy_consent')) return 'Please tick to agree to the privacy notice.';
  if (m.includes('required: conduct_accepted')) return "Please tick to agree to the club's code of conduct.";
  if (m.includes('bad_phone')) return 'One of the phone numbers does not look right.';
  if (m.includes('bad_date_of_birth')) return 'That date of birth does not look right.';
  if (m.includes('name_taken')) return 'Somebody at the club already has that name. Add a middle initial or a surname.';
  if (m.includes('signup_closed')) return "This club isn't taking online sign-ups at the moment.";
  if (m.includes('email_on_another_record') || m.includes('player_already_has_login') || m.includes('player_is_looked_after'))
    return 'Your email address is on a player record that is already in use at this club. Ask the club to check it.';
  if (m.includes('dependants_off')) return 'This club does not add people you look after here. Ask the club if you need to.';
  if (m.includes('too_many_dependants')) return 'You can look after up to 8 people here. Ask the club if you need more.';
  if (m.includes('too_long')) return 'One of the answers is too long.';
  if (m.includes('bad_dupr_id')) return 'That DUPR ID does not look right. It is letters and numbers only.';
  if (m.includes('bad_pe_number')) return 'That Pickleball England number does not look right.';
  if (m.includes('not_a_child')) return 'Someone 18 or over joins with their own email address, so their details are their own.';
  if (m.includes('login_removed')) return 'The club removed this login. Ask the club if you think that is wrong.';
  return raw;
}

/** Everything the join page may know before anyone signs in. Null on a backend without 94. */
export async function clubJoinInfo(): Promise<ClubJoinInfo | null> {
  const { data, error } = await supabase.rpc('club_join_info', { p_club_slug: BACKEND.slug });
  if (error || !data) return null;
  return data as ClubJoinInfo;
}

/** Me, then the people I look after. Null when signed out or not a member here. */
export async function getMyPeople(): Promise<Person[] | null> {
  const club = await hostClubId();
  if (!club) return null;
  const { data, error } = await supabase.rpc('my_people', { p_club: club });
  if (error || !data) return null;
  return data as Person[];
}

type Result = { ok: true } | { ok: false; error: string };

export async function savePersonDetails(playerId: string, details: MemberDetails): Promise<Result> {
  const club = await hostClubId();
  if (!club) return { ok: false, error: 'Could not find the club.' };
  const { error } = await supabase.rpc('save_my_person_details', { p_club: club, p_player: playerId, p_details: details });
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true };
}

export async function addDependant(name: string, gender: string | null, details: MemberDetails): Promise<Result> {
  const club = await hostClubId();
  if (!club) return { ok: false, error: 'Could not find the club.' };
  const { error } = await supabase.rpc('add_my_dependant', {
    p_club: club, p_name: name.trim(), p_gender: gender, p_details: details,
  });
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true };
}

/** Join the club and save your details in one step. Called after the email code is verified. */
export async function joinClubWithDetails(name: string, gender: string | null, details: MemberDetails): Promise<Result> {
  const { error } = await supabase.rpc('join_club_with_details', {
    p_club_slug: BACKEND.slug, p_name: name.trim(), p_gender: gender, p_details: details,
  });
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true };
}

/** The same rules the database applies to joining, checked first so the form can say what is
 *  missing. Returns the first problem, or null. */
export function detailsProblem(d: MemberDetails, opts: { dependant: boolean; conductUrl: string | null }): string | null {
  if (!d.date_of_birth) return 'Please add a date of birth.';
  if (!opts.dependant && !d.phone?.trim()) return 'Please add a phone number.';
  if (!d.emergency1_name?.trim() || !d.emergency1_relationship?.trim() || !d.emergency1_phone?.trim()) {
    return 'Please add an emergency contact: name, relationship and phone.';
  }
  const phoneOk = (p: string | null) => !p || /^[0-9+() -]{7,20}$/.test(p.trim());
  if (![d.phone, d.phone2, d.emergency1_phone, d.emergency2_phone].every(phoneOk)) return 'One of the phone numbers does not look right.';
  if (d.dupr_id && !/^[A-Za-z0-9-]{3,30}$/.test(d.dupr_id.trim())) return 'That DUPR ID does not look right. It is letters and numbers only.';
  // Health notes are only kept with the tick (94 clears them without it), so never let them be
  // typed and then silently dropped.
  const health = [d.medical_conditions, d.allergies, d.medication, d.adjustments, d.medical_notes].some((x) => x?.trim());
  if (health && !d.medical_consent) {
    return 'You have written health notes. Tick the box under them so the club can keep them, or clear them.';
  }
  if (!d.privacy_consent) return 'Please tick to agree to the privacy notice.';
  if (opts.conductUrl && !d.conduct_accepted) return "Please tick to agree to the club's code of conduct.";
  return null;
}

/** DD/MM/YYYY as typed -> YYYY-MM-DD, or null if it is not a real date. */
export function parseUkDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() > Date.now()) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** YYYY-MM-DD -> DD/MM/YYYY for the input box. */
export function toUkDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
