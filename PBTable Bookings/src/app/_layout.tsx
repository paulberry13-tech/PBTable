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
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BannerHost } from '@/components/BannerHost';
import { BookingNotOpen } from '@/components/BookingNotOpen';
import { DemoPersonSwitcher } from '@/components/DemoPersonSwitcher';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SignIn } from '@/components/SignIn';
import { applyPlatformIcons } from '@/services/brand';
import { bookingEnabledForThisHost } from '@/services/clubGate';
import { announceRoute, EMBEDDED, layoutReturnTarget, reserveScrollbarSpace } from '@/services/embed';
import { USE_SUPABASE } from '@/services/config';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors, fonts } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Back from Stripe in the whole window, after starting a top-up inside the club site's side-panel
// layout: go back into the layout's Booking > Wallet, carrying Stripe's reference, before anything
// renders. See services/embed.ts.
let REDIRECTING = false;
if (Platform.OS === 'web' && typeof window !== 'undefined' && !EMBEDDED) {
  let target: string | null = null;
  try { target = layoutReturnTarget(window.location, window.sessionStorage); } catch {}
  if (target) { REDIRECTING = true; window.location.replace(target); }
}

/** Inside the club site's layout, tells the side panel which booking page is showing. */
function EmbedBridge() {
  const pathname = usePathname();
  useEffect(() => { announceRoute(pathname); }, [pathname]);
  // Screens mount their scroll areas as their data arrives, so keep reserving scrollbar space as the
  // page changes (a no-op outside the layout).
  useEffect(() => {
    if (!EMBEDDED || typeof document === 'undefined') return;
    let queued = false;
    const run = () => { queued = false; reserveScrollbarSpace(document); };
    run();
    const obs = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 30); } });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}

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

  // twoclear addresses get twoclear's tab and home-screen icons (see services/brand).
  useEffect(() => { applyPlatformIcons(); }, []);

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

  // Leaving for the layout: render nothing, so the wallet here cannot claim the payment first.
  if (REDIRECTING) return null;
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
      </Stack>
      </ErrorBoundary>
      <AuthGate />
      <BannerHost />
      <EmbedBridge />
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
  const gateRouter = useRouter();
  const needsIdentity = PRIVATE_ROUTES.some((r) => pathname.startsWith(r)) || signInPrompted;
  if (!USE_SUPABASE || currentUser || !needsIdentity) return null;

  // There must ALWAYS be a way out of this screen.
  //
  // It renders as a full-screen overlay covering the tab bar, so when it is raised by
  // NAVIGATING to My Bookings or Wallet — rather than by tapping Book — passing
  // `undefined` left the member with no cancel control AND no tabs: a dead end with
  // nothing to press. Survivable on the web, which has a back button and a URL bar.
  // A phone has neither. Reported on Gloucester, 2026-09-02.
  //
  // Raised on demand -> dismiss and stay put. Raised by the route -> back to the tab
  // that is public.
  const cancel = signInPrompted ? dismissSignIn : () => gateRouter.replace('/');

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
