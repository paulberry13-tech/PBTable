// One form for a person's details, used in three places so they cannot drift apart:
//   join          a newcomer, after confirming their email (name + their details)
//   self / dependant   "My details": editing yourself or a child you look after
//   newDependant  adding a child (name + their details)
//
// It checks what the database will require (people.detailsProblem) before submitting, so a
// member sees what is missing on the form rather than as an error afterwards. The database
// checks again regardless.

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import {
  detailsProblem, EMPTY_DETAILS, INTERESTS, parseUkDate, PLAY_LEVELS, toUkDate, type Interest, type MemberDetails,
} from '@/services/people';
import { colors, fonts, radius, spacing, type } from '@/theme';

type Mode = 'join' | 'self' | 'dependant' | 'newDependant';

export type DetailsSubmit = { name: string; gender: string | null; details: MemberDetails };

export function MemberDetailsForm({
  mode, initialName = '', initialGender = null, initial, conductUrl, privacyUrl, clubName, shareWording = null,
  submitLabel, busy, error, onSubmit, onCancel, me = null,
}: {
  mode: Mode;
  initialName?: string;
  initialGender?: string | null;
  initial?: Partial<MemberDetails> | null;
  conductUrl: string | null;
  privacyUrl: string | null;
  clubName?: string | null;
  /** The "pass my details on to register the membership" wording; the tick is shown when set. */
  shareWording?: string | null;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (v: DetailsSubmit) => void;
  onCancel?: () => void;
  /** The parent adding a child: their own name and phone, offered as the child's emergency contact. */
  me?: { name: string | null; phone: string | null } | null;
}) {
  const dependant = mode === 'dependant' || mode === 'newDependant';
  const askName = mode === 'join' || mode === 'newDependant';
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<string | null>(initialGender);
  const [d, setD] = useState<MemberDetails>({ ...EMPTY_DETAILS, ...(initial ?? {}) });
  const [dob, setDob] = useState(toUkDate(initial?.date_of_birth ?? null));
  const [localError, setLocalError] = useState<string | null>(null);
  const OPTIONAL: (keyof MemberDetails)[] = ['phone2', 'address_line1', 'address_line2', 'town', 'postcode', 'emergency2_name',
    'emergency2_relationship', 'emergency2_phone', 'play_level', 'dupr_id', 'pe_number'];
  const [more, setMore] = useState(() => OPTIONAL.some((k) => !!(initial as Record<string, unknown> | null | undefined)?.[k])
    || ((initial?.interests ?? []).length > 0));
  const set = <K extends keyof MemberDetails>(k: K, v: MemberDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof MemberDetails) => (d[k] as string | null) ?? '';

  // Under 18 by the date typed, or someone a parent looks after: show the junior questions.
  const dobIso = dob.trim() ? parseUkDate(dob) : null;
  const junior = dependant || (!!dobIso && Date.parse(dobIso) > Date.now() - 18 * 365.25 * 864e5);
  const toggleInterest = (i: Interest) => {
    const cur = d.interests ?? [];
    set('interests', cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]);
  };

  const submit = () => {
    setLocalError(null);
    if (askName && name.trim().length < 2) { setLocalError('Please give a full name.'); return; }
    const iso = dob.trim() ? parseUkDate(dob) : null;
    if (dob.trim() && !iso) { setLocalError('Date of birth should be like 21/06/1985.'); return; }
    // First name and surname default from the full name when left blank.
    const full = (askName ? name : initialName).trim().split(/\s+/);
    const details: MemberDetails = {
      ...d, date_of_birth: iso,
      first_name: d.first_name?.trim() || (full.length > 1 ? full.slice(0, -1).join(' ') : full[0] || null),
      last_name: d.last_name?.trim() || (full.length > 1 ? full[full.length - 1] : null),
    };
    const problem = detailsProblem(details, { dependant, conductUrl });
    if (problem) { setLocalError(problem); return; }
    onSubmit({ name: name.trim(), gender, details });
  };

  const who = dependant ? (askName ? 'their' : `${initialName.split(' ')[0]}'s`) : 'your';

  return (
    <View>
      {askName && (
        <>
          <Text style={styles.label}>{dependant ? 'Their full name' : 'Full name'}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words"
            placeholder="Alex Morgan" placeholderTextColor={colors.textFaint} />
          <Text style={styles.hint}>The name the club and other players see on a session line-up.</Text>
        </>
      )}

      <Text style={styles.label}>Date of birth</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation"
        placeholder="DD/MM/YYYY" placeholderTextColor={colors.textFaint} />

      {askName && (
        <>
          <Text style={styles.label}>Gender (optional)</Text>
          <View style={styles.chips}>
            {[['female', 'Female'], ['male', 'Male'], ['other', 'Other'], [null, 'Prefer not to say']].map(([v, l]) => (
              <Pressable key={l as string} onPress={() => setGender(v as string | null)}
                style={[styles.chip, gender === v && styles.chipOn]} accessibilityRole="radio"
                accessibilityState={{ selected: gender === v }}>
                <Text style={[styles.chipText, gender === v && styles.chipTextOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>{dependant ? 'Their mobile (optional)' : 'Mobile'}</Text>
      <TextInput style={styles.input} value={text('phone')} onChangeText={(v) => set('phone', v)}
        keyboardType="phone-pad" placeholder="07700 900123" placeholderTextColor={colors.textFaint} />
      {dependant && <Text style={styles.hint}>The club contacts you about them.</Text>}


      <Text style={styles.section}>Emergency contact</Text>
      <Text style={styles.hint}>
        Who the club should call if something happens to {dependant ? 'them' : 'you'} at a session.
      </Text>
      {dependant && me && (me.name || me.phone) ? (
        <Pressable onPress={() => setD((x) => ({ ...x, emergency1_name: me.name ?? x.emergency1_name,
            emergency1_relationship: x.emergency1_relationship || 'Parent', emergency1_phone: me.phone ?? x.emergency1_phone }))}
          style={styles.useMe} accessibilityRole="button" hitSlop={6}>
          <Ionicons name="person-circle-outline" size={16} color={colors.coralText} />
          <Text style={styles.link}>Use my name and phone</Text>
        </Pressable>
      ) : null}
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={text('emergency1_name')} onChangeText={(v) => set('emergency1_name', v)}
        autoCapitalize="words" placeholder="Sam Morgan" placeholderTextColor={colors.textFaint} />
      <Text style={styles.label}>Relationship</Text>
      <TextInput style={styles.input} value={text('emergency1_relationship')}
        onChangeText={(v) => set('emergency1_relationship', v)} placeholder="Partner, parent, friend…"
        placeholderTextColor={colors.textFaint} />
      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={text('emergency1_phone')} onChangeText={(v) => set('emergency1_phone', v)}
        keyboardType="phone-pad" placeholder="07700 900456" placeholderTextColor={colors.textFaint} />

      {/* Everything optional, folded away so joining on a phone is short (council 2026-10-07).
          Open from the start when any of it is already filled in. */}
      <Pressable onPress={() => setMore(!more)} style={styles.moreRow} accessibilityRole="button"
        accessibilityState={{ expanded: more }}>
        <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.navy} />
        <View style={{ flex: 1 }}>
          <Text style={styles.moreTitle}>More about {dependant ? 'them' : 'you'} (optional)</Text>
          <Text style={styles.hint}>Name on official records, another phone, address, a second emergency contact, playing level.</Text>
        </View>
      </Pressable>
      {more && (
        <View>
      <Text style={styles.label}>Name on official records (optional)</Text>
      <View style={styles.pair}>
        <TextInput style={[styles.input, { flex: 1 }]} value={text('first_name')} onChangeText={(v) => set('first_name', v)}
          autoCapitalize="words" placeholder="First name" placeholderTextColor={colors.textFaint} accessibilityLabel="First name" />
        <TextInput style={[styles.input, { flex: 1 }]} value={text('last_name')} onChangeText={(v) => set('last_name', v)}
          autoCapitalize="words" placeholder="Surname" placeholderTextColor={colors.textFaint} accessibilityLabel="Surname" />
      </View>
      <Text style={styles.hint}>Left blank, they are taken from the name above.</Text>

      <Text style={styles.label}>Another phone (optional)</Text>
      <TextInput style={styles.input} value={text('phone2')} onChangeText={(v) => set('phone2', v)}
        keyboardType="phone-pad" placeholder="Home or work" placeholderTextColor={colors.textFaint} />

      <Text style={styles.label}>Address (optional)</Text>
      <TextInput style={styles.input} value={text('address_line1')} onChangeText={(v) => set('address_line1', v)}
        placeholder="House and street" placeholderTextColor={colors.textFaint} accessibilityLabel="Address line 1" />
      <TextInput style={[styles.input, { marginTop: spacing.sm }]} value={text('address_line2')} onChangeText={(v) => set('address_line2', v)}
        placeholder="Second line" placeholderTextColor={colors.textFaint} accessibilityLabel="Address line 2" />
      <View style={styles.pair}>
        <TextInput style={[styles.input, { flex: 1 }]} value={text('town')} onChangeText={(v) => set('town', v)}
          autoCapitalize="words" placeholder="Town" placeholderTextColor={colors.textFaint} accessibilityLabel="Town" />
        <TextInput style={[styles.input, { flex: 1 }]} value={text('postcode')} onChangeText={(v) => set('postcode', v)}
          autoCapitalize="characters" placeholder="Postcode" placeholderTextColor={colors.textFaint} accessibilityLabel="Postcode" />
      </View>

      <Text style={styles.label}>Second contact (optional)</Text>
      <TextInput style={styles.input} value={text('emergency2_name')} onChangeText={(v) => set('emergency2_name', v)}
        autoCapitalize="words" placeholder="Name" placeholderTextColor={colors.textFaint} />
      <View style={styles.pair}>
        <TextInput style={[styles.input, { flex: 1 }]} value={text('emergency2_relationship')}
          onChangeText={(v) => set('emergency2_relationship', v)} placeholder="Relationship"
          placeholderTextColor={colors.textFaint} />
        <TextInput style={[styles.input, { flex: 1 }]} value={text('emergency2_phone')}
          onChangeText={(v) => set('emergency2_phone', v)} keyboardType="phone-pad" placeholder="Phone"
          placeholderTextColor={colors.textFaint} />
      </View>

      <Text style={styles.subsection}>Playing</Text>
      <Text style={styles.label}>{dependant ? 'Their level' : 'Your level'}</Text>
      <View style={styles.chips}>
        {PLAY_LEVELS.map(([v, l]) => (
          <Pressable key={v} onPress={() => set('play_level', d.play_level === v ? null : v)}
            style={[styles.chip, d.play_level === v && styles.chipOn]} accessibilityRole="radio"
            accessibilityState={{ selected: d.play_level === v }}>
            <Text style={[styles.chipText, d.play_level === v && styles.chipTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Interested in</Text>
      <View style={styles.chips}>
        {INTERESTS.map(([v, l]) => {
          const on = (d.interests ?? []).includes(v);
          return (
            <Pressable key={v} onPress={() => toggleInterest(v)} style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.pair}>
        <TextInput style={[styles.input, { flex: 1 }]} value={text('dupr_id')} onChangeText={(v) => set('dupr_id', v)}
          autoCapitalize="characters" placeholder="DUPR ID" placeholderTextColor={colors.textFaint} accessibilityLabel="DUPR ID" />
        <TextInput style={[styles.input, { flex: 1 }]} value={text('pe_number')} onChangeText={(v) => set('pe_number', v)}
          autoCapitalize="characters" placeholder="Pickleball England no." placeholderTextColor={colors.textFaint}
          accessibilityLabel="Pickleball England membership number" />
      </View>

        </View>
      )}

      {junior && (
        <>
          <Text style={styles.section}>For a junior</Text>
          <Text style={styles.hint}>From their parent or guardian, for whoever runs the session.</Text>
          <YesNo label="May the club give them first aid if needed?" value={d.junior_first_aid}
            onChange={(v) => set('junior_first_aid', v)} />
          <YesNo label="May they leave a session on their own?" value={d.junior_leave_alone}
            onChange={(v) => set('junior_leave_alone', v)} />
          <Text style={styles.label}>Who else may collect them? (optional)</Text>
          <TextInput style={styles.input} value={text('junior_collect_by')} onChangeText={(v) => set('junior_collect_by', v)}
            placeholder="Name and relationship, e.g. Joan Smith (grandparent)" placeholderTextColor={colors.textFaint} />
        </>
      )}

      <Text style={styles.section}>Health (optional)</Text>
      <Text style={styles.hint}>
        Anything a first aider should know. Only the people running {dependant ? 'their' : 'your'} sessions and the club's senior
        admins can see it, and only to help in an emergency.
      </Text>
      {([['medical_conditions', 'Medical conditions', 'e.g. asthma, diabetes, heart condition'],
         ['allergies', 'Allergies', 'e.g. nuts, bee stings'],
         ['medication', 'Medication', 'e.g. carries an inhaler'],
         ['adjustments', 'Anything needed to play', 'e.g. a knee support, hearing or sight needs'],
         ['medical_notes', 'Anything else', 'Leave blank if nothing to add']] as [keyof MemberDetails, string, string][]).map(([k, l, ph]) => (
        <View key={k}>
          <Text style={styles.label}>{l}</Text>
          <TextInput style={[styles.input, styles.areaSmall]} value={text(k)} onChangeText={(v) => set(k, v as never)}
            multiline placeholder={ph} placeholderTextColor={colors.textFaint} />
        </View>
      ))}
      <Tick on={d.medical_consent} onPress={() => set('medical_consent', !d.medical_consent)}
        label={`I agree to the club keeping ${who} health notes for use in an emergency. Without this tick they are not saved.`} />

      <Text style={styles.section}>Agreements</Text>
      <Tick on={d.privacy_consent} onPress={() => set('privacy_consent', !d.privacy_consent)}
        label={`I agree to ${clubName ?? 'the club'} keeping these details to run sessions and contact ${dependant ? 'me about them' : 'me'}.`}
        link={privacyUrl ? { title: 'Read the privacy notice', url: privacyUrl } : undefined} />
      {conductUrl && (
        <Tick on={d.conduct_accepted} onPress={() => set('conduct_accepted', !d.conduct_accepted)}
          label={`${dependant ? 'They agree' : 'I agree'} to follow the club's code of conduct.`}
          link={{ title: 'Read the code of conduct', url: conductUrl }} />
      )}
      <Tick on={d.photo_consent === true} onPress={() => set('photo_consent', !(d.photo_consent === true))}
        label={`The club may use photos of ${dependant ? 'them' : 'me'} playing (optional).`} />
      <Tick on={d.marketing_opt_in === true} onPress={() => set('marketing_opt_in', !(d.marketing_opt_in === true))}
        label="Send me club news by email (optional)." />
      {shareWording ? (
        <Tick on={d.share_consent} onPress={() => set('share_consent', !d.share_consent)}
          label={`${shareWording} (Needed to buy a membership.)`} />
      ) : null}

      {(localError || error) ? <Text style={styles.error}>{localError || error}</Text> : null}
      <Button title={submitLabel} onPress={submit} loading={busy} disabled={busy} style={{ marginTop: spacing.lg }} />
      {onCancel && (
        <Pressable onPress={onCancel} hitSlop={8} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

// Yes / No with nothing chosen until the parent answers: a junior question must not default.
function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.tickText}>{label}</Text>
      <View style={[styles.chips, { marginTop: 6 }]}>
        {([[true, 'Yes'], [false, 'No']] as [boolean, string][]).map(([v, l]) => (
          <Pressable key={l} onPress={() => onChange(value === v ? null : v)} style={[styles.chip, value === v && styles.chipOn]}
            accessibilityRole="radio" accessibilityState={{ selected: value === v }} accessibilityLabel={`${label} ${l}`}>
            <Text style={[styles.chipText, value === v && styles.chipTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Tick({ on, onPress, label, link }: {
  on: boolean; onPress: () => void; label: string; link?: { title: string; url: string };
}) {
  return (
    <View style={styles.tickRow}>
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={label} style={styles.tickHit}>
        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.coral : colors.textMuted} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.tickText} onPress={onPress}>{label}</Text>
        {/* https only: the link comes from the club's settings, and anything else (a javascript:
            or http: link) is not opened at all. The database applies the same rule. */}
        {link && /^https:\/\/\S+$/.test(link.url) && (
          <Text style={styles.link} onPress={() => Linking.openURL(link.url)} accessibilityRole="link">{link.title}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.tiny, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 6 },
  section: { ...type.h2, color: colors.navy, marginTop: spacing.xl },
  subsection: { ...type.tiny, textTransform: 'uppercase', color: colors.navy, marginTop: spacing.lg },
  moreRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xl,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  moreTitle: { ...type.body, fontFamily: fonts.bold, color: colors.navy },
  useMe: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 44, fontSize: 15,
    fontFamily: fonts.regular, color: colors.text, backgroundColor: colors.card,
  },
  area: { minHeight: 80, textAlignVertical: 'top', marginTop: spacing.sm },
  areaSmall: { minHeight: 48, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.coral, backgroundColor: colors.coral },
  chipText: { ...type.caption, color: colors.text },
  chipTextOn: { color: '#fff', fontFamily: fonts.bold },
  tickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start' },
  tickHit: { paddingTop: 1 },
  tickText: { ...type.body, color: colors.text },
  link: { fontFamily: fonts.bold, color: colors.coralText, fontSize: 13, marginTop: 4 },
  error: { marginTop: spacing.md, color: colors.downText, fontFamily: fonts.medium, fontSize: 13 },
});
