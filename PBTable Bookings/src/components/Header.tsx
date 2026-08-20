import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/store/AppContext';
import { colors, fonts, spacing } from '@/theme';

const LOGO = require('../../assets/images/pbtable-logo.png');

/** Browse views promoted out of the bottom tab bar to the top of every screen. */
const NAV = [
  { label: 'Leaderboard', path: '/leaderboard' as const },
  { label: 'Players', path: '/players' as const },
];

/**
 * Brand header: the PBTable logo + wordmark, a web-only "Admin" link out to the club-site
 * admin area (the single admin surface — the in-app admin was removed), and a top nav row
 * for the Leaderboard and Players views (the core booking actions — Sessions, My Bookings,
 * Wallet — stay in the bottom tab bar).
 */
export function Header() {
  const { sportProfile, setSport } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => setSport(sportProfile.sport === 'pickleball' ? 'tennis' : 'pickleball')}
          accessibilityLabel="PBTable"
          style={({ pressed }) => [styles.brand, pressed && { opacity: 0.85 }]}
        >
          <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
          <View>
            <Text style={styles.logo}>
              <Text style={styles.logoLight}>PB</Text>
              <Text style={styles.logoBold}>Table</Text>
            </Text>
            <Text style={styles.sport}>{sportProfile.sport.toUpperCase()} CLUB</Text>
          </View>
        </Pressable>

        {/* Web-only: admin lives on the club-site dashboard (/?admin=1), which handles its
            own email→OTP sign-in for registered admins. There is no in-app admin. */}
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={() => {
              if (typeof window !== 'undefined') window.location.assign('/?admin=1');
            }}
            accessibilityRole="link"
            accessibilityLabel="Admin sign in"
            style={({ pressed }) => [styles.adminBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.adminText}>Admin ›</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.nav}>
        {/* Web-only: the app is embedded at /app on the club site — give members a
            clear way back out to the public dashboard. On native there's no site to
            return to, so it's hidden. */}
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={() => {
              if (typeof window !== 'undefined') window.location.assign('/');
            }}
            accessibilityRole="link"
            accessibilityLabel="Back to the club site"
            style={({ pressed }) => [styles.navBtn, styles.backBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.navText, styles.backText]}>‹ Club site</Text>
          </Pressable>
        ) : null}
        {NAV.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              onPress={() => router.push(item.path)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.navBtn,
                active && styles.navBtnActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
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
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoImg: {
    width: 38,
    height: 38,
    borderRadius: 9,
  },
  logo: {
    fontSize: 23,
    color: colors.textOnDark,
    letterSpacing: -0.4,
  },
  logoLight: { fontFamily: fonts.regular },
  logoBold: { fontFamily: fonts.extrabold },
  sport: {
    color: colors.coralBright,
    fontSize: 10,
    fontFamily: fonts.extrabold,
    letterSpacing: 1.8,
    marginTop: 1,
  },
  adminBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  adminText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  navBtnActive: {
    backgroundColor: colors.coral,
  },
  backBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  backText: {
    color: 'rgba(255,255,255,0.75)',
  },
  navText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  navTextActive: {
    color: colors.textOnDark,
  },
});
