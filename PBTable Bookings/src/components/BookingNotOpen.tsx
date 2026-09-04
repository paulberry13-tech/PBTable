import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** Shown instead of the app when a club has not had booking switched on.
 *
 *  Deliberately a dead end with no sign-in and no retry: there is nothing here for
 *  the visitor to do yet, and offering a sign-in box would invite people to try
 *  accounts that do not exist. It names the club so it never reads as a broken page. */
export function BookingNotOpen({ clubName }: { clubName?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Ionicons name="calendar-outline" size={40} color={colors.coral} />
        <Text style={styles.title}>BOOKING ISN&rsquo;T OPEN YET</Text>
        <Text style={styles.body}>
          {clubName ? `${clubName} hasn't` : "This club hasn't"} switched on online session
          booking. Your club will let you know when it goes live.
        </Text>
        <Text style={styles.foot}>
          In the meantime, session line-ups and the leaderboard are on the club&rsquo;s
          main site.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 420, alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.textOnDark, textAlign: 'center', letterSpacing: 0.5 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.textOnDark, textAlign: 'center', opacity: 0.9 },
  foot: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textOnDark, textAlign: 'center', opacity: 0.6 },
});
