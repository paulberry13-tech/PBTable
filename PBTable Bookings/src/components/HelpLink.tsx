// A small "How does this work?" link to the player guides (/help.html, a page on the club's own
// site, built from screenshots of the app). Inside the club site's layout the app is in a frame,
// so the guide opens in the whole window, where it can be read and shared; on its own, in place.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { EMBEDDED } from '@/services/embed';
import { colors, fonts } from '@/theme';

export type HelpGuide = 'sign-in' | 'top-up' | 'book' | 'waiting-list' | 'cancel';

export function openHelp(guide?: HelpGuide): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = `/help.html${guide ? `#${guide}` : ''}`;
  const win = EMBEDDED && window.top ? window.top : window;
  win.location.assign(url);
}

export function HelpLink({ guide, label, center = false }: { guide: HelpGuide; label: string; center?: boolean }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Pressable onPress={() => openHelp(guide)} accessibilityRole="link" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [styles.row, center && { alignSelf: 'center' }, pressed && { opacity: 0.7 }]}>
      <Ionicons name="help-circle-outline" size={16} color={colors.coralText} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.coralText },
});
