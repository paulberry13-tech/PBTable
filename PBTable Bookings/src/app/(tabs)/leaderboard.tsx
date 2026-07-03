import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingView, Row } from '@/components/ui';
import * as data from '@/services/data';
import { LeaderboardEntry } from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

export default function LeaderboardScreen() {
  const router = useRouter();
  const { sportProfile } = useApp();
  const { data: entries, loading } = useAsyncData(() => data.getLeaderboard());

  if (loading && !entries) return <LoadingView label="Ranking the club…" />;

  const podium = (entries ?? []).slice(0, 3);
  const rest = (entries ?? []).slice(3);

  const openPlayer = (id: string) =>
    router.push({ pathname: '/player/[id]', params: { id } });

  return (
    <View style={styles.screen}>
      <FlatList
        data={rest}
        keyExtractor={(e) => e.member.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={type.display}>Leaderboard</Text>
            <Text style={[type.caption, { marginBottom: spacing.md }]}>
              {sportProfile.terms.rating} — rated players only. Play graded{' '}
              {sportProfile.terms.session.toLowerCase()}s to appear here.
            </Text>

            {podium.length > 0 ? (
              <View style={styles.podium}>
                {podium.map((entry, i) => (
                  <Pressable
                    key={entry.member.id}
                    onPress={() => openPlayer(entry.member.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.podiumRow,
                      i < podium.length - 1 && styles.podiumDivider,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.podiumRank}>{entry.rank}</Text>
                    <View style={{ flex: 1 }}>
                      <Row gap={6}>
                        <Text style={styles.podiumName} numberOfLines={1}>
                          {entry.member.name}
                        </Text>
                        {entry.hot ? <Text style={styles.hotDark}>HOT 🔥</Text> : null}
                      </Row>
                      <Text style={styles.podiumGames}>
                        {entry.member.gradedGames} graded games
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.podiumRating}>
                        {entry.member.rating?.toFixed(2)}
                      </Text>
                      <Movement entry={entry} onDark />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          podium.length === 0 ? <EmptyState title="No rated players yet" /> : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openPlayer(item.member.id)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.rank}>{item.rank}</Text>
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
              <Movement entry={item} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function Movement({ entry, onDark }: { entry: LeaderboardEntry; onDark?: boolean }) {
  if (entry.movement === 'flat') {
    return (
      <Text style={[styles.move, { color: onDark ? colors.textOnDarkMuted : colors.textFaint }]}>
        —
      </Text>
    );
  }
  const up = entry.movement === 'up';
  const arrow = up ? colors.up : onDark ? '#FF8A80' : colors.down;
  const text = onDark ? (up ? '#7BE0A8' : '#FF8A80') : up ? colors.upText : colors.downText;
  return (
    <Row gap={2}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={arrow} />
      <Text style={[styles.move, { color: text }]}>
        {Math.abs(entry.movementDelta).toFixed(2)}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  // --- podium (top 3, broadcast-graphic dark panel) ---
  podium: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.raised,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  podiumDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  podiumRank: {
    fontFamily: fonts.displayBold,
    fontSize: 30,
    color: colors.coralBright,
    width: 34,
    textAlign: 'center',
  },
  podiumName: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textOnDark,
    flexShrink: 1,
  },
  podiumGames: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.textOnDarkMuted,
    marginTop: 1,
  },
  podiumRating: {
    ...type.monoBold,
    fontSize: 24,
    color: colors.textOnDark,
  },
  hotDark: {
    fontSize: 10,
    fontFamily: fonts.extrabold,
    color: colors.navy,
    backgroundColor: colors.coralBright,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  // --- the rest of the table ---
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.coralText,
    backgroundColor: colors.coralSoft,
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
