// "Before you book: an emergency contact" -- for a club that asks everyone who books for one
// (Club settings, migration 94 section 21). Members usually have one from joining; visitors and
// non-members give just this: a name, how they know them, a phone, and agree to the club keeping it.
// The booking itself is refused by the database without one, so this only says so before the tap.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { clubJoinInfo, saveEmergencyContact } from '@/services/people';
import { colors, fonts, radius, spacing, type } from '@/theme';

export function EmergencyContactCard({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<{ name: string; privacy: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    clubJoinInfo().then((i) => { if (live && i) setClub({ name: i.club_name, privacy: i.privacy_notice_url }); });
    return () => { live = false; };
  }, []);

  const save = async () => {
    if (!name.trim() || !relationship.trim() || !phone.trim()) { setError('Please fill in all three: name, how you know them, and their phone.'); return; }
    if (!agree) { setError('Please tick to agree to the club keeping this.'); return; }
    setBusy(true); setError(null);
    const r = await saveEmergencyContact(name, relationship, phone, agree);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved();
  };

  return (
    <Card>
      <Text style={styles.h2}>Before you book: an emergency contact</Text>
      <Text style={styles.meta}>
        {club?.name ?? 'The club'} asks everyone who plays for someone to call if something happens to you at a
        session. You only do this once.
      </Text>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words"
        placeholder="Sam Morgan" placeholderTextColor={colors.textFaint} accessibilityLabel="Emergency contact name" />
      <Text style={styles.label}>Relationship</Text>
      <TextInput style={styles.input} value={relationship} onChangeText={setRelationship}
        placeholder="Partner, parent, friend…" placeholderTextColor={colors.textFaint} accessibilityLabel="Relationship" />
      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
        placeholder="07700 900456" placeholderTextColor={colors.textFaint} accessibilityLabel="Emergency contact phone" />
      <View style={styles.tickRow}>
        <Pressable onPress={() => setAgree(!agree)} hitSlop={6} accessibilityRole="checkbox"
          accessibilityState={{ checked: agree }} accessibilityLabel="Agree to the club keeping this">
          <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? colors.coral : colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.tickText} onPress={() => setAgree(!agree)}>
            I agree to {club?.name ?? 'the club'} keeping this to contact them if something happens to me at a session.
          </Text>
          {club?.privacy && /^https:\/\/\S+$/.test(club.privacy) ? (
            <Text style={styles.link} onPress={() => Linking.openURL(club.privacy!)} accessibilityRole="link">
              How the club uses your details</Text>
          ) : null}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {/* Saves only: the Book button below still books, so this must not look like a second one. */}
      <Button title="Save contact" variant="secondary" onPress={save} loading={busy} style={{ marginTop: spacing.md }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  h2: { ...type.h2, color: colors.navy },
  meta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  label: { ...type.tiny, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 44, fontSize: 15,
    fontFamily: fonts.regular, color: colors.text, backgroundColor: colors.card,
  },
  tickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start' },
  tickText: { ...type.body, color: colors.text },
  link: { fontFamily: fonts.bold, color: colors.coralText, fontSize: 13, marginTop: 4 },
  error: { marginTop: spacing.md, color: colors.downText, fontFamily: fonts.medium, fontSize: 13 },
});
