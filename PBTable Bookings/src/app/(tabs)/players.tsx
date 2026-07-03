import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, LoadingView, Row } from '@/components/ui';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

/** Players directory — EVERYONE, with unrated members clearly marked. */
export default function PlayersScreen() {
  const router = useRouter();
  const { sportProfile } = useApp();
  const { data: members, loading } = useAsyncData(() => data.getMembers());
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      (members ?? []).filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())),
    [members, query]
  );

  if (loading && !members) return <LoadingView label="Loading players…" />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={type.display}>Players</Text>
            <Text style={type.caption}>All club members and guests — rated or not.</Text>
            <TextInput
              style={styles.search}
              placeholder="Search players…"
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <Text style={type.h2}>{item.name}</Text>
                {item.memberType === 'guest' ? <Badge label="Guest" tone="grey" /> : null}
                {item.memberType === 'junior' ? <Badge label="Junior" tone="navy" /> : null}
              </Row>
              <Text style={type.caption}>
                {item.ratingState === 'unrated'
                  ? 'Unrated'
                  : `${item.gradedGames} graded games${item.ratingState === 'provisional' ? ' · provisional' : ''}`}
              </Text>
            </View>
            {item.rating !== undefined ? (
              <Text style={styles.rating}>{item.rating.toFixed(2)}</Text>
            ) : (
              <Badge label="Unrated" tone="grey" />
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  search: {
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.card,
  },
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
  rating: {
    ...type.monoBold,
    fontSize: 15,
    color: colors.navy,
  },
});
