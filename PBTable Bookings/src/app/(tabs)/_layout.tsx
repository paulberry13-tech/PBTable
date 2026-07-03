import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Header } from '@/components/Header';
import { useApp } from '@/store/AppContext';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { role } = useApp();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.coral,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
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
          name="leaderboard"
          options={{
            title: 'Leaderboard',
            tabBarIcon: ({ color, size }) => <Ionicons name="podium" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="players"
          options={{
            title: 'Players',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            // Hidden entirely unless the role switcher is set to Admin.
            href: role === 'admin' ? '/admin' : null,
            tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
