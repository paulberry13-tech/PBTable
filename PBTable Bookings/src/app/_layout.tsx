import { Stack } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { BannerHost } from '@/components/BannerHost';
import { AppProvider } from '@/store/AppContext';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
        <Stack.Screen name="admin/create" options={{ title: 'Create session' }} />
        <Stack.Screen name="admin/manage/[id]" options={{ title: 'Manage session' }} />
        <Stack.Screen name="admin/scores/[id]" options={{ title: 'Enter scores' }} />
      </Stack>
      <BannerHost />
    </AppProvider>
  );
}
