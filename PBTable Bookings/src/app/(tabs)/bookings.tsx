import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Badge, Button, Card, EmptyState, LoadingView, Row } from '@/components/ui';
import { sessionStart } from '@/domain/cancellation';
import { formatSessionWhen } from '@/lib/format';
import * as data from '@/services/data';
import { formatPence } from '@/services/payments';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, spacing, type } from '@/theme';

export default function MyBookingsScreen() {
  const router = useRouter();
  const { currentUser, refresh, showBanner } = useApp();
  const { data: bookings, loading } = useAsyncData(
    () => (currentUser ? data.getMyBookings(currentUser.id) : Promise.resolve([])),
    [currentUser?.id]
  );

  const [confirming, setConfirming] = useState<{ sessionId: string; title: string; warning: string } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  if (loading && !bookings) return <LoadingView label="Loading your bookings…" />;

  const now = new Date();
  const upcoming = (bookings ?? []).filter(
    (b) => b.session.status === 'upcoming' && sessionStart(b.session) >= now
  );
  const past = (bookings ?? []).filter((b) => !upcoming.includes(b));

  const askCancel = async (sessionId: string, title: string) => {
    if (!currentUser) return;
    const warning = await data.getCancellationWarning(sessionId, currentUser.id);
    setConfirming({ sessionId, title, warning });
  };

  const doCancel = async () => {
    if (!confirming || !currentUser) return;
    setCancelBusy(true);
    try {
      const result = await data.cancelBooking(confirming.sessionId, currentUser.id);
      refresh();
      showBanner(result.policyNote, result.refunded ? 'success' : 'info');
      if (result.promotedMemberName) {
        showBanner(`${result.promotedMemberName} promoted from the waitlist`, 'success');
      }
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Cancellation failed', 'warning');
    } finally {
      setCancelBusy(false);
      setConfirming(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>My bookings</Text>

      <Text style={[type.h1, { marginTop: spacing.lg, marginBottom: spacing.md }]}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <EmptyState title="Nothing booked yet" hint="Head to Sessions to grab a spot." />
      ) : (
        upcoming.map(({ booking, session }) => (
          <Card key={booking.id} style={{ marginBottom: spacing.md }}>
            <Pressable onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={type.h2}>{session.title}</Text>
                {booking.status === 'waitlisted' ? (
                  <Badge label="Waitlisted" tone="amber" />
                ) : (
                  <Badge label="Booked" tone="green" />
                )}
              </Row>
              <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
              <Text style={[type.caption, { marginTop: 2 }]}>
                Paid {formatPence(booking.paidPence)}
              </Text>
            </Pressable>
            <Button
              title={booking.status === 'waitlisted' ? 'Leave waitlist' : 'Cancel booking'}
              variant="ghost"
              onPress={() => void askCancel(session.id, session.title)}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ))
      )}

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Past</Text>
      {past.length === 0 ? (
        <Text style={type.caption}>No past bookings yet.</Text>
      ) : (
        past.map(({ booking, session }) => (
          <Card key={booking.id} style={{ marginBottom: spacing.md, opacity: 0.85 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Text style={type.h2}>{session.title}</Text>
                <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
              </View>
              <Badge
                label={booking.status === 'attended' ? 'Attended' : booking.status}
                tone={booking.status === 'attended' ? 'navy' : 'grey'}
              />
            </Row>
          </Card>
        ))
      )}

      <ConfirmSheet
        visible={confirming !== null}
        title={`Cancel ${confirming?.title ?? ''}?`}
        message={confirming?.warning ?? ''}
        confirmLabel="Cancel booking"
        destructive
        busy={cancelBusy}
        onConfirm={() => void doCancel()}
        onClose={() => setConfirming(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
});
