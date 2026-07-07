import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BannerHost } from '@/components/BannerHost';
import { SignIn } from '@/components/SignIn';
import { USE_SUPABASE } from '@/services/config';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors, fonts } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProvider>
      <StatusBar style="light" />
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
        <Stack.Screen name="session/[id]" options={{ title: 'SESSION' }} />
        <Stack.Screen name="player/[id]" options={{ title: 'PLAYER' }} />
        <Stack.Screen name="admin/create" options={{ title: 'CREATE SESSION' }} />
        <Stack.Screen name="admin/manage/[id]" options={{ title: 'MANAGE SESSION' }} />
        <Stack.Screen name="admin/scores/[id]" options={{ title: 'ENTER SCORES' }} />
      </Stack>
      <AuthGate />
      <BannerHost />
    </AppProvider>
  );
}

/** On the live backend, overlay a sign-in screen until there's a session.
 *  In mock mode this is always inert (there's a fixed user). */
function AuthGate() {
  const { authLoading, currentUser } = useApp();
  if (!USE_SUPABASE || currentUser) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {authLoading ? <View style={{ flex: 1, backgroundColor: colors.navy }} /> : <SignIn />}
    </View>
  );
}
