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
};

export const EMPTY_DETAILS: MemberDetails = {
  date_of_birth: null, phone: null, postcode: null,
  emergency1_name: null, emergency1_relationship: null, emergency1_phone: null,
  emergency2_name: null, emergency2_relationship: null, emergency2_phone: null,
  medical_notes: null, medical_consent: false, privacy_consent: false, conduct_accepted: false,
  photo_consent: null, marketing_opt_in: null,
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
  if (m.includes('too_many_dependants')) return 'You can look after up to 8 people here. Ask the club if you need more.';
  if (m.includes('too_long')) return 'One of the answers is too long.';
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
  if (![d.phone, d.emergency1_phone, d.emergency2_phone].every(phoneOk)) return 'One of the phone numbers does not look right.';
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
