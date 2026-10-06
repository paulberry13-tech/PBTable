import React, { useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { myPlaceOn, SessionCard } from '@/components/SessionCard';
import { Chip, EmptyState, ErrorState, LoadingView } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import * as data from '@/services/data';
import { EMBEDDED_FILL, useEmbedded } from '@/services/embed';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, spacing, type } from '@/theme';
import { SessionFormat } from '@/types';

type GradedFilter = 'all' | 'graded' | 'social';

// "Hide ones I've booked" is each member's own choice, remembered on this phone (web only;
// the native app would use AsyncStorage). Every club gets the "Booked" tags; nobody's list
// is hidden unless they ask for it.
const HIDE_KEY = 'pb_hide_booked';
const readHide = () => { if (Platform.OS !== 'web') return false; try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
const writeHide = (on: boolean) => { if (Platform.OS !== 'web') return; try { window.localStorage.setItem(HIDE_KEY, on ? '1' : '0'); } catch {} };

export default function SessionsScreen() {
  const embedded = useEmbedded();
  const { sportProfile, currentUser } = useApp();
  const { data: sessions, loading, error } = useAsyncData(() => data.getSessions());
  const [formatFilter, setFormatFilter] = useState<SessionFormat | 'all'>('all');
  const [gradedFilter, setGradedFilter] = useState<GradedFilter>('all');
  const [hideMine, setHideMine] = useState<boolean>(readHide);
  const meId = currentUser?.id ?? null;
  const anyMine = useMemo(() => (sessions ?? []).some((s) => s.status === 'upcoming' && myPlaceOn(s, meId)), [sessions, meId]);
  const hiding = hideMine && !!meId;

  const upcoming = useMemo(
    () =>
      (sessions ?? []).filter(
        (s) =>
          s.status === 'upcoming' &&
          (formatFilter === 'all' || s.format === formatFilter) &&
          (gradedFilter === 'all' ||
            (gradedFilter === 'graded' ? s.affectsRating : !s.affectsRating)) &&
          !(hiding && myPlaceOn(s, meId))
      ),
    [sessions, formatFilter, gradedFilter, hiding, meId]
  );

  if (loading && !sessions) return <LoadingView label="Loading sessions…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={upcoming}
        keyExtractor={(s) => s.id}
        contentContainerStyle={[styles.list, embedded && EMBEDDED_FILL]}
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
            {meId && (anyMine || hideMine) ? (
              <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
                <Chip
                  label={hideMine ? '✓ Hiding ones I’ve booked' : 'Hide ones I’ve booked'}
                  selected={hideMine}
                  onPress={() => { const next = !hideMine; setHideMine(next); writeHide(next); }}
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <SessionCard session={item} profile={sportProfile} meId={meId} />}
        ListEmptyComponent={
          hiding && anyMine ? (
            <EmptyState title="You’re on everything coming up" hint="Your sessions are in My Bookings. Tap “Hiding ones I’ve booked” above to show them here too." />
          ) : (
            <EmptyState title="No sessions match" hint="Try clearing the filters above." />
          )
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
