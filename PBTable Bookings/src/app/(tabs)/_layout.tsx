import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Header } from '@/components/Header';
import { useEmbedded } from '@/services/embed';
import { getMembershipQuote } from '@/services/membership';
import { useApp } from '@/store/AppContext';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  // Inside the club site's side-panel layout, Book a session / My bookings / Wallet are in the
  // panel, so the bottom tab bar hides. Opened on its own at /app, it shows as always.
  const embedded = useEmbedded();
  // Most clubs do not sell memberships, so the tab is offered only where one does.
  // PBTable switches it on per club; membership_quote answers {enabled:false} when it
  // is off, and null on a backend without the migrations. Both mean "no tab".
  const { currentUser } = useApp();
  const [hasMemberships, setHasMemberships] = useState(false);
  useEffect(() => {
    let alive = true;
    getMembershipQuote()
      .then((q) => alive && setHasMemberships(!!q?.enabled))
      .catch(() => alive && setHasMemberships(false));
    return () => { alive = false; };
  }, [currentUser?.id]);

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
        <Tabs.Screen
          name="details"
          options={{
            title: 'My details',
            // Every club: an emergency contact is a duty of care, not a membership feature.
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="membership"
          options={{
            title: 'Membership',
            // href null removes it from the bar entirely rather than showing a tab that
            // explains it has nothing to show.
            href: hasMemberships ? undefined : null,
            tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
