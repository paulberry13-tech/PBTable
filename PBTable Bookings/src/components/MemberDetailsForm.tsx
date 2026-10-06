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
  detailsProblem, EMPTY_DETAILS, parseUkDate, toUkDate, type MemberDetails,
} from '@/services/people';
import { colors, fonts, radius, spacing, type } from '@/theme';

type Mode = 'join' | 'self' | 'dependant' | 'newDependant';

export type DetailsSubmit = { name: string; gender: string | null; details: MemberDetails };

export function MemberDetailsForm({
  mode, initialName = '', initialGender = null, initial, conductUrl, privacyUrl, clubName, shareWording = null,
  submitLabel, busy, error, onSubmit, onCancel,
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
}) {
  const dependant = mode === 'dependant' || mode === 'newDependant';
  const askName = mode === 'join' || mode === 'newDependant';
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<string | null>(initialGender);
  const [d, setD] = useState<MemberDetails>({ ...EMPTY_DETAILS, ...(initial ?? {}) });
  const [dob, setDob] = useState(toUkDate(initial?.date_of_birth ?? null));
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof MemberDetails>(k: K, v: MemberDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof MemberDetails) => (d[k] as string | null) ?? '';

  const submit = () => {
    setLocalError(null);
    if (askName && name.trim().length < 2) { setLocalError('Please give a full name.'); return; }
    const iso = dob.trim() ? parseUkDate(dob) : null;
    if (dob.trim() && !iso) { setLocalError('Date of birth should be like 21/06/1985.'); return; }
    const details: MemberDetails = { ...d, date_of_birth: iso };
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

      <Text style={styles.label}>Postcode (optional)</Text>
      <TextInput style={styles.input} value={text('postcode')} onChangeText={(v) => set('postcode', v)}
        autoCapitalize="characters" placeholder="GL1 2AB" placeholderTextColor={colors.textFaint} />

      <Text style={styles.section}>Emergency contact</Text>
      <Text style={styles.hint}>
        Who the club should call if something happens to {dependant ? 'them' : 'you'} at a session.
      </Text>
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

      <Text style={styles.section}>Health (optional)</Text>
      <Text style={styles.hint}>
        Anything a first aider should know: a condition, an allergy, medication. Only the people
        running a session can see it, and only to help in an emergency.
      </Text>
      <TextInput style={[styles.input, styles.area]} value={text('medical_notes')}
        onChangeText={(v) => set('medical_notes', v)} multiline placeholder="Leave blank if nothing to add"
        placeholderTextColor={colors.textFaint} />
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
  hint: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 44, fontSize: 15,
    fontFamily: fonts.regular, color: colors.text, backgroundColor: colors.card,
  },
  area: { minHeight: 80, textAlignVertical: 'top', marginTop: spacing.sm },
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
