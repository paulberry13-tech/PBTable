import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

/**
 * Brand header: "PB" light + "Table" bold lockup, sport toggle and the
 * Member/Admin role switcher (in production, admin would be primarily web).
 */
export function Header() {
  const { role, switchRole, sportProfile, setSport } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => setSport(sportProfile.sport === 'pickleball' ? 'tennis' : 'pickleball')}
          accessibilityLabel="Toggle sport profile"
        >
          <Text style={styles.logo}>
            <Text style={styles.logoLight}>PB</Text>
            <Text style={styles.logoBold}>Table</Text>
          </Text>
          <Text style={styles.sport}>{sportProfile.sport.toUpperCase()} CLUB</Text>
        </Pressable>

        <View style={styles.switcher}>
          {(['member', 'admin'] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => switchRole(r)}
              style={[styles.switchBtn, role === r && styles.switchBtnActive]}
            >
              <Text style={[styles.switchText, role === r && styles.switchTextActive]}>
                {r === 'member' ? 'Member' : 'Admin'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 24,
    color: colors.textOnDark,
    letterSpacing: -0.5,
  },
  logoLight: { fontWeight: '300' },
  logoBold: { fontWeight: '900' },
  sport: {
    color: colors.coral,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 1,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    padding: 3,
  },
  switchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  switchBtnActive: {
    backgroundColor: colors.coral,
  },
  switchText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
  },
  switchTextActive: {
    color: colors.textOnDark,
  },
});
