import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BannerHost } from '@/components/BannerHost';
import { BookingNotOpen } from '@/components/BookingNotOpen';
import { ClubPicker } from '@/components/ClubPicker';
import { DemoPersonSwitcher } from '@/components/DemoPersonSwitcher';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SignIn } from '@/components/SignIn';
import { CLUB_IS_FROM_HOSTNAME } from '@/services/backend';
import { bookingEnabledForThisClub } from '@/services/clubGate';
import { clearStoredClub, loadStoredClub } from '@/services/clubStore';
import { USE_SUPABASE } from '@/services/config';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors, fonts } from '@/theme';

SplashScreen.preventAutoHideAsync();

// The stack only draws its own back button when the navigator has history. A
// session opened from a shared link, a bookmark, or just a page reload has none,
// and these screens sit outside the tab navigator — so there was no way back to
// the app at all. This always renders, and falls back to the Sessions tab when
// there is nothing to pop.
function HeaderBack() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back to sessions"
      style={({ pressed }) => [styles.headerBack, pressed && styles.headerBackPressed]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
      <Text style={styles.headerBackText}>Back</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Oswald_600SemiBold,
    Oswald_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // WHICH CLUB. On web the hostname has already answered (backend.ts) and this
  // resolves immediately. On native it is read from storage, and when nothing is
  // stored the picker runs before anything else — every query below needs a club.
  // See docs/DECISION-01-CLUB-RESOLUTION.md.
  const [clubReady, setClubReady] = React.useState(CLUB_IS_FROM_HOSTNAME);
  const [needsPicker, setNeedsPicker] = React.useState(false);
  useEffect(() => {
    if (CLUB_IS_FROM_HOSTNAME) return;
    let alive = true;
    loadStoredClub().then((club) => {
      if (!alive) return;
      if (club) setClubReady(true);
      else setNeedsPicker(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Hold the splash until there is something real to show — the app, or the
    // picker — rather than handing over to a blank navy screen.
    if ((fontsLoaded || fontError) && (clubReady || needsPicker)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, clubReady, needsPicker]);

  // Booking is switched on per club by the operator. The bundle is committed to
  // every club site, so this is what stops a club that has not launched booking
  // from serving it to anyone who types /app. null = still asking.
  const [booking, setBooking] = React.useState<{ on: boolean; clubName?: string } | null>(null);
  useEffect(() => {
    if (!clubReady) return;   // nothing to ask about until a club is settled
    let alive = true;
    setBooking(null);
    bookingEnabledForThisClub().then((r) => alive && setBooking(r));
    return () => {
      alive = false;
    };
  }, [clubReady]);

  // Send a native member back to the picker: the only way out of a club that has
  // since switched booking off, or one picked by mistake. On web the URL is the
  // club, so there is nothing to change.
  const changeClub = React.useCallback(() => {
    clearStoredClub().then(() => {
      setClubReady(false);
      setBooking(null);
      setNeedsPicker(true);
    });
  }, []);

  if (!fontsLoaded && !fontError) return null;
  if (needsPicker) {
    return (
      <ClubPicker
        onPicked={() => {
          setNeedsPicker(false);
          setClubReady(true);
        }}
      />
    );
  }
  if (!clubReady) return <View style={{ flex: 1, backgroundColor: colors.navy }} />;
  if (booking === null) return <View style={{ flex: 1, backgroundColor: colors.navy }} />;
  if (!booking.on) {
    return (
      <BookingNotOpen
        clubName={booking.clubName}
        onChangeClub={CLUB_IS_FROM_HOSTNAME ? undefined : changeClub}
      />
    );
  }

  return (
    <AppProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: {
            fontFamily: fonts.displayBold,
            fontSize: 20,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/[id]"
          options={{ title: 'SESSION', headerBackVisible: false, headerLeft: () => <HeaderBack /> }}
        />
      </Stack>
      </ErrorBoundary>
      <AuthGate />
      <BannerHost />
      <DemoPersonSwitcher />
    </AppProvider>
  );
}

/** Browsing the club's sessions is PUBLIC — the same
 *  information the club's own dashboard shows to anyone. The sign-in appears only
 *  where identity is actually needed: the personal tabs (My Bookings, Wallet) and
 *  the moment someone taps Book, which calls promptSignIn().
 *
 *  In mock mode this is always inert (there's a fixed user). */
const PRIVATE_ROUTES = ['/bookings', '/wallet'];

function AuthGate() {
  const { authLoading, currentUser, signInPrompted, dismissSignIn } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const needsIdentity = PRIVATE_ROUTES.some((r) => pathname.startsWith(r)) || signInPrompted;
  if (!USE_SUPABASE || currentUser || !needsIdentity) return null;

  // There must ALWAYS be a way out of this screen.
  //
  // It renders as a full-screen overlay, which covers the tab bar — so when it is
  // raised by NAVIGATING to My Bookings or Wallet (rather than by tapping Book),
  // an undefined onCancel left the member with no cancel control and no tabs: a
  // dead end with nothing to press. Survivable on the web, where the browser has
  // a back button and a URL bar. A phone has neither, and this is exactly what a
  // member hits the first time they explore the app without signing in.
  //
  // Raised on demand -> dismiss and stay put. Raised by the route -> go back to
  // the tab that is public.
  const cancel = signInPrompted ? dismissSignIn : () => router.replace('/');

  return (
    <View style={StyleSheet.absoluteFill}>
      {authLoading ? <View style={{ flex: 1, backgroundColor: colors.navy }} /> : <SignIn onCancel={cancel} />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 12,
    marginLeft: -6,
  },
  headerBackPressed: { opacity: 0.6 },
  headerBackText: {
    color: colors.textOnDark,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
});
