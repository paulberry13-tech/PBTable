import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SessionCard } from '@/components/SessionCard';
import { Chip, EmptyState, ErrorState, LoadingView } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, spacing, type } from '@/theme';
import { SessionFormat } from '@/types';

type GradedFilter = 'all' | 'graded' | 'social';

export default function SessionsScreen() {
  const { sportProfile } = useApp();
  const { data: sessions, loading, error } = useAsyncData(() => data.getSessions());
  const [formatFilter, setFormatFilter] = useState<SessionFormat | 'all'>('all');
  const [gradedFilter, setGradedFilter] = useState<GradedFilter>('all');

  const upcoming = useMemo(
    () =>
      (sessions ?? []).filter(
        (s) =>
          s.status === 'upcoming' &&
          (formatFilter === 'all' || s.format === formatFilter) &&
          (gradedFilter === 'all' ||
            (gradedFilter === 'graded' ? s.affectsRating : !s.affectsRating))
      ),
    [sessions, formatFilter, gradedFilter]
  );

  if (loading && !sessions) return <LoadingView label="Loading sessions…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={upcoming}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={[type.display, { marginBottom: 2 }]}>Upcoming {sportProfile.terms.session.toLowerCase()}s</Text>
            <Text style={[type.caption, { marginBottom: spacing.md }]}>
              Book your spot. Graded {sportProfile.terms.session.toLowerCase()}s move your {sportProfile.terms.rating}.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['all', 'graded', 'social'] as const).map((g) => (
                  <Chip
                    key={g}
                    label={g === 'all' ? 'All' : g === 'graded' ? 'Graded' : 'Social'}
                    selected={gradedFilter === g}
                    onPress={() => setGradedFilter(g)}
                  />
                ))}
                <View style={styles.divider} />
                {sportProfile.formats.map((f) => (
                  <Chip
                    key={f}
                    label={FORMAT_LABELS[f] ?? f}
                    selected={formatFilter === f}
                    onPress={() => setFormatFilter(formatFilter === f ? 'all' : f)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => <SessionCard session={item} profile={sportProfile} />}
        ListEmptyComponent={
          <EmptyState title="No sessions match" hint="Try clearing the filters above." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  divider: { width: 1, backgroundColor: colors.border, marginHorizontal: 6 },
});
