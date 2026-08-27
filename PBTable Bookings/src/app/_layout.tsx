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
import { DemoPersonSwitcher } from '@/components/DemoPersonSwitcher';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SignIn } from '@/components/SignIn';
import { bookingEnabledForThisHost } from '@/services/clubGate';
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Booking is switched on per club by the operator. The bundle is committed to
  // every club site, so this is what stops a club that has not launched booking
  // from serving it to anyone who types /app. null = still asking.
  const [booking, setBooking] = React.useState<{ on: boolean; clubName?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    bookingEnabledForThisHost().then((r) => alive && setBooking(r));
    return () => {
      alive = false;
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;
  if (booking === null) return <View style={{ flex: 1, backgroundColor: colors.navy }} />;
  if (!booking.on) return <BookingNotOpen clubName={booking.clubName} />;

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
        <Stack.Screen
          name="player/[id]"
          options={{ title: 'PLAYER', headerBackVisible: false, headerLeft: () => <HeaderBack /> }}
        />
      </Stack>
      </ErrorBoundary>
      <AuthGate />
      <BannerHost />
      <DemoPersonSwitcher />
    </AppProvider>
  );
}

/** Browsing the club's sessions, leaderboard and players is PUBLIC — the same
 *  information the club's own dashboard shows to anyone. The sign-in appears only
 *  where identity is actually needed: the personal tabs (My Bookings, Wallet) and
 *  the moment someone taps Book, which calls promptSignIn().
 *
 *  In mock mode this is always inert (there's a fixed user). */
const PRIVATE_ROUTES = ['/bookings', '/wallet'];

function AuthGate() {
  const { authLoading, currentUser, signInPrompted, dismissSignIn } = useApp();
  const pathname = usePathname();
  const needsIdentity = PRIVATE_ROUTES.some((r) => pathname.startsWith(r)) || signInPrompted;
  if (!USE_SUPABASE || currentUser || !needsIdentity) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {authLoading ? <View style={{ flex: 1, backgroundColor: colors.navy }} /> : <SignIn onCancel={signInPrompted ? dismissSignIn : undefined} />}
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
