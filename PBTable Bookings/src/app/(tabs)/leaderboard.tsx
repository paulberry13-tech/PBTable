import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingView, Row } from '@/components/ui';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

export default function LeaderboardScreen() {
  const router = useRouter();
  const { sportProfile } = useApp();
  const { data: entries, loading } = useAsyncData(() => data.getLeaderboard());

  if (loading && !entries) return <LoadingView label="Ranking the club…" />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.member.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={type.display}>Leaderboard</Text>
            <Text style={type.caption}>
              {sportProfile.terms.rating} — rated players only. Play graded{' '}
              {sportProfile.terms.session.toLowerCase()}s to appear here.
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No rated players yet" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: item.member.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <Text style={[styles.rank, item.rank <= 3 && { color: colors.coralText }]}>
              {item.rank}
            </Text>
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <Text style={type.h2} numberOfLines={1}>
                  {item.member.name}
                </Text>
                {item.hot ? <Text style={styles.hot}>HOT 🔥</Text> : null}
                {item.member.ratingState === 'provisional' ? (
                  <Text style={styles.provisional}>P</Text>
                ) : null}
              </Row>
              <Text style={type.caption}>{item.member.gradedGames} graded games</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.rating}>{item.member.rating?.toFixed(2)}</Text>
              {item.movement === 'flat' ? (
                <Text style={[styles.move, { color: colors.textFaint }]}>—</Text>
              ) : (
                <Row gap={2}>
                  <Ionicons
                    name={item.movement === 'up' ? 'caret-up' : 'caret-down'}
                    size={12}
                    color={item.movement === 'up' ? colors.up : colors.down}
                  />
                  <Text
                    style={[
                      styles.move,
                      { color: item.movement === 'up' ? colors.upText : colors.downText },
                    ]}
                  >
                    {Math.abs(item.movementDelta).toFixed(2)}
                  </Text>
                </Row>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rank: {
    ...type.monoBold,
    fontSize: 15,
    width: 30,
    color: colors.textFaint,
  },
  rating: {
    ...type.monoBold,
    fontSize: 19,
    color: colors.navy,
  },
  move: {
    ...type.mono,
    fontSize: 11,
  },
  hot: {
    fontSize: 10,
    fontFamily: fonts.extrabold,
    color: colors.pinkDeep,
    backgroundColor: colors.pink,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  provisional: {
    fontSize: 10,
    fontFamily: fonts.extrabold,
    color: colors.textFaint,
    backgroundColor: colors.trackBg,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
