import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubOption, chooseClub, listBookableClubs } from '@/services/clubStore';
import { colors, fonts, radius, spacing } from '@/theme';

/** First launch on native: which club is this?
 *
 *  On web the subdomain answers this and the picker never renders. On a phone
 *  there is no hostname, and the alternative — a build and an App Store listing
 *  per club — forks the product per customer. See
 *  docs/DECISION-01-CLUB-RESOLUTION.md.
 *
 *  The list is every club with booking switched on, read straight from `clubs`
 *  (public to anon under RLS), so a new club appears here the moment booking is
 *  enabled for it — no release, no migration.
 *
 *  The choice is a DEFAULT, not a claim of membership: signing in replaces it with
 *  whatever club the member actually belongs to. */
export function ClubPicker({ onPicked }: { onPicked: (club: ClubOption) => void }) {
  const insets = useSafeAreaInsets();
  const [clubs, setClubs] = React.useState<ClubOption[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busySlug, setBusySlug] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setFailed(false);
    setClubs(null);
    listBookableClubs()
      .then((list) => { if (alive) setClubs(list); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt]);

  const pick = async (club: ClubOption) => {
    setBusySlug(club.slug);
    await chooseClub(club);
    onPicked(club);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl }]}>
      <View style={styles.head}>
        <Text style={styles.logo}>
          <Text style={styles.logoLight}>PB</Text>
          <Text style={styles.logoBold}>Table</Text>
        </Text>
        <Text style={styles.title}>CHOOSE YOUR CLUB</Text>
        <Text style={styles.sub}>You can change this later.</Text>
      </View>

      {clubs === null && !failed ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.coralBright} />
        </View>
      ) : null}

      {failed ? (
        <View style={styles.centre}>
          <Text style={styles.msg}>We couldn&rsquo;t load the club list.</Text>
          <Text style={styles.msgFaint}>Check your connection and try again.</Text>
          <Pressable
            onPress={() => setAttempt((n) => n + 1)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {clubs !== null && clubs.length === 0 ? (
        <View style={styles.centre}>
          <Text style={styles.msg}>No clubs are taking bookings yet.</Text>
          <Text style={styles.msgFaint}>
            Your club will let you know when theirs goes live.
          </Text>
        </View>
      ) : null}

      {clubs !== null && clubs.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {clubs.map((club) => (
            <Pressable
              key={club.id}
              onPress={() => pick(club)}
              disabled={busySlug !== null}
              accessibilityRole="button"
              accessibilityLabel={club.name}
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.85 },
                busySlug !== null && busySlug !== club.slug && { opacity: 0.5 },
              ]}
            >
              {club.logoUrl ? (
                <Image source={{ uri: club.logoUrl }} style={styles.logoImg} resizeMode="contain" />
              ) : (
                <View style={[styles.logoImg, styles.logoFallback]}>
                  <Text style={styles.logoInitial}>{club.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.rowName} numberOfLines={2}>{club.name}</Text>
              {busySlug === club.slug ? (
                <ActivityIndicator color={colors.navy} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: spacing.xl },
  head: { alignItems: 'center', gap: 6, marginBottom: spacing.xl },
  logo: { fontSize: 26, color: colors.textOnDark, letterSpacing: -0.4 },
  logoLight: { fontFamily: fonts.regular },
  logoBold: { fontFamily: fonts.extrabold },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.textOnDark,
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.textOnDarkMuted },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: spacing.xxl },
  msg: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textOnDark, textAlign: 'center' },
  msgFaint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textOnDarkMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  retry: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
  },
  retryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.textOnDark },
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    // 44px minimum touch target, comfortably exceeded.
    paddingVertical: spacing.lg,
  },
  logoImg: { width: 40, height: 40, borderRadius: radius.sm },
  logoFallback: { backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.textOnDark },
  rowName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.text },
});
