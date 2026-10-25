import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PROJECT } from '@/services/backend';
import { CLUB_PAGE_LABELS, ClubPage, openClubPage } from '@/services/clubSite';
import * as data from '@/services/data';
import { useApp } from '@/store/AppContext';
import { colors, fonts, spacing } from '@/theme';

const LOGO = require('../../assets/images/pbtable-logo.png');


/**
 * Brand header: the club's logo + name, a web-only "Admin" link out to the club-site
 * admin area (the single admin surface — the in-app admin was removed), and a nav row
 * linking out to the club's public Leaderboard and Social pages. The core booking
 * actions — Sessions, My Bookings, Wallet — stay in the bottom tab bar.
 */
/** Browse views promoted out of the bottom tab bar to the top of every screen.
 *
 *  These are NOT app screens — they open the club's own website, which is where the
 *  leaderboard and the Social page live and where ratings are actually computed. See
 *  services/clubSite.ts for why the app links out instead of rebuilding them.
 *
 *  On native they open in an in-app browser, so a member never loses the app. */
const NAV: { label: string; page: ClubPage }[] = [
  { label: CLUB_PAGE_LABELS.leaderboard, page: 'leaderboard' },
  { label: CLUB_PAGE_LABELS.social, page: 'social' },
];

export function Header() {
  const { sportProfile, setSport, dataVersion } = useApp();
  const insets = useSafeAreaInsets();
  // The club's own identity. Null until it loads and null if it cannot be read, in
  // which case the PBTable mark below is what shows — the header is never empty.
  //
  // Re-read on dataVersion, not just on mount: on native the club can change
  // underneath the app when signing in adopts the member's own club, and a header
  // still showing the picked club's name would be the most visible way to get that
  // wrong. getClubBranding memoises, so a bump with no club change costs nothing.
  const [club, setClub] = React.useState<{ name: string | null; logoUrl: string | null } | null>(null);
  React.useEffect(() => {
    let alive = true;
    data.getClubBranding().then((b) => { if (alive) setClub(b); }).catch(() => {});
    return () => { alive = false; };
  }, [dataVersion]);

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
          onPress={PROJECT.isDemo
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
        {NAV.map((item) => (
          <Pressable
            key={item.page}
            onPress={() => openClubPage(item.page)}
            accessibilityRole="link"
            accessibilityLabel={`${item.label} on the club website`}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.navText}>{item.label}</Text>
          </Pressable>
        ))}
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
