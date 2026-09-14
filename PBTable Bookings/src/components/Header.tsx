import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BACKEND } from '@/services/backend';
import * as data from '@/services/data';
import { useEmbedded } from '@/services/embed';
import { useApp } from '@/store/AppContext';
import { colors, fonts, spacing } from '@/theme';

const LOGO = require('../../assets/images/pbtable-logo.png');


/**
 * Brand header: the PBTable logo + wordmark, a web-only "Admin" link out to the club-site
 * admin area (the single admin surface — the in-app admin was removed), and a top nav row
 * for the Leaderboard and Players views (the core booking actions — Sessions, My Bookings,
 * Wallet — stay in the bottom tab bar).
 */
/** Browse views promoted out of the bottom tab bar to the top of every screen.
 *  Empty since the Leaderboard and Players tabs were removed. Kept as an empty
 *  list WITH its map intact: deleting the map outright changed the rendered tree
 *  relative to the static pre-render and introduced a hydration mismatch
 *  (React #418) on every screen. */
const NAV: { label: string; path: '/bookings' | '/wallet' }[] = [];

export function Header() {
  const { sportProfile, setSport } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  // The club's own identity. Null until it loads and null if it cannot be read, in
  // which case the PBTable mark below is what shows — the header is never empty.
  const [club, setClub] = React.useState<{ name: string | null; logoUrl: string | null } | null>(null);
  React.useEffect(() => {
    let alive = true;
    data.getClubBranding().then((b) => { if (alive) setClub(b); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Inside the club site's side-panel layout the panel carries the club's name, the admin
  // sign-in and the way back to the site, so this header would only repeat it.
  const embedded = useEmbedded();
  if (embedded) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <Pressable
          // The sport switch is a demo/prospect toy. It was tolerable on a PBTable
          // wordmark labelled "PICKLEBALL CLUB" — that line said what the button did
          // and showed which mode you were in. Now the brand is the CLUB's own name
          // and that label is gone, so on a real club a tap would silently re-word
          // the whole app ("Session" -> "Fixture", "RDR" -> "Club rating") with
          // nothing to explain it and no visible way back. Inert off demo.
          onPress={BACKEND.isDemo
            ? () => setSport(sportProfile.sport === 'pickleball' ? 'tennis' : 'pickleball')
            : undefined}
          accessibilityLabel={club?.name || 'PBTable'}
          style={({ pressed }) => [styles.brand, pressed && { opacity: 0.85 }]}
        >
          <Image
            source={club?.logoUrl ? { uri: club.logoUrl } : LOGO}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <View style={styles.brandText}>
            {club?.name ? (
              <Text style={styles.clubName} numberOfLines={2}>{club.name}</Text>
            ) : (
              <>
                <Text style={styles.logo}>
                  <Text style={styles.logoLight}>PB</Text>
                  <Text style={styles.logoBold}>Table</Text>
                </Text>
                <Text style={styles.sport}>{sportProfile.sport.toUpperCase()} CLUB</Text>
              </>
            )}
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
              style={({ pressed }) => [styles.navBtn, active && styles.navBtnActive, pressed && { opacity: 0.8 }]}
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
    flexShrink: 1,
  },
  // A club name is longer than a wordmark and must not shove the Admin link off
  // the row, so the text block shrinks and a long name wraps to two lines.
  brandText: { flexShrink: 1 },
  clubName: {
    color: colors.textOnDark,
    fontSize: 17,
    fontFamily: fonts.extrabold,
    lineHeight: 20,
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
