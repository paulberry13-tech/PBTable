import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Header } from '@/components/Header';
import { useEmbedded } from '@/services/embed';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  // Inside the club site's side-panel layout, Book a session / My bookings / Wallet are in the
  // panel, so the bottom tab bar hides. Opened on its own at /app, it shows as always.
  const embedded = useEmbedded();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.coralBright,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
          tabBarStyle: embedded
            ? { display: 'none' }
            : {
                backgroundColor: colors.navy,
                borderTopColor: colors.navyDeep,
              },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Sessions',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="bookings"
          options={{
            title: 'My Bookings',
            tabBarIcon: ({ color, size }) => <Ionicons name="ticket" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: 'Wallet',
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
