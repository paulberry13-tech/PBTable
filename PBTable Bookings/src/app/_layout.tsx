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

import { BannerHost } from '@/components/BannerHost';
import { AppProvider } from '@/store/AppContext';
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
      <BannerHost />
    </AppProvider>
  );
}
