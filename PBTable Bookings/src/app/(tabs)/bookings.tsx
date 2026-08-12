import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Badge, Button, DateBlock, EmptyState, LoadingView, Row } from '@/components/ui';
import { sessionStart } from '@/domain/cancellation';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { countdownLabel, dateBlockParts, formatSessionWhen, formatTimeRange } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

export default function MyBookingsScreen() {
  const router = useRouter();
  const { currentUser, refresh, showBanner } = useApp();
  const { data: bookings, loading } = useAsyncData(
    () => (currentUser ? data.getMyBookings(currentUser.id) : Promise.resolve([])),
    [currentUser?.id]
  );
  const { data: balance } = useAsyncData(
    () => (currentUser ? data.getBalance(currentUser.id) : Promise.resolve(0)),
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

      <Pressable
        onPress={() => router.push('/wallet')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.walletStrip, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="wallet" size={20} color={colors.coralBright} />
        <View style={{ flex: 1 }}>
          <Text style={styles.walletLabel}>WALLET</Text>
          <Text style={styles.walletBalance}>{formatMoney(balance ?? 0)}</Text>
        </View>
        <Text style={styles.walletCta}>Top up</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textOnDarkMuted} />
      </Pressable>

      <Text style={[type.h1, { marginTop: spacing.lg, marginBottom: spacing.md }]}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <EmptyState title="Nothing booked yet" hint="Head to Sessions to grab a spot." />
      ) : (
        upcoming.map(({ booking, session }) => {
          const parts = dateBlockParts(session.date);
          const kind = session.affectsRating ? 'graded' : 'social';
          const soon = countdownLabel(session);
          const waitlisted = booking.status === 'waitlisted';
          return (
            <View key={booking.id} style={styles.card}>
              <Pressable
                onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
                accessibilityRole="button"
              >
                <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
                  <DateBlock {...parts} kind={kind} />
                  <View style={{ flex: 1 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={spacing.sm}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {session.title}
                      </Text>
                      {waitlisted ? <Badge label="Waitlisted" tone="amber" /> : <Badge label="Booked" tone="green" />}
                    </Row>
                    <Row style={{ marginTop: 3, flexWrap: 'wrap' }} gap={spacing.sm}>
                      <Text style={styles.cardMeta}>{formatTimeRange(session)}</Text>
                      {soon ? (
                        <View style={styles.soonChip}>
                          <Text style={styles.soonText}>{soon}</Text>
                        </View>
                      ) : null}
                    </Row>
                    {session.location ? (
                      <Text style={[styles.cardMeta, { marginTop: 3 }]} numberOfLines={1}>
                        {session.location}
                      </Text>
                    ) : null}
                    <Text style={[styles.cardPaid, { marginTop: 5 }]}>
                      {booking.paidPence === 0
                        ? waitlisted
                          ? 'No charge while you wait'
                          : 'Free'
                        : `Paid ${formatMoneyShort(booking.paidPence)}`}
                    </Text>
                  </View>
                </Row>
              </Pressable>
              <Button
                title={waitlisted ? 'Leave waitlist' : 'Cancel booking'}
                variant="ghost"
                onPress={() => void askCancel(session.id, session.title)}
                style={{ marginTop: spacing.md }}
              />
            </View>
          );
        })
      )}

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Past</Text>
      {past.length === 0 ? (
        <Text style={type.caption}>No past bookings yet.</Text>
      ) : (
        past.map(({ booking, session }) => (
          <View key={booking.id} style={[styles.card, styles.pastCard]}>
            <Row style={{ justifyContent: 'space-between' }} gap={spacing.sm}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {session.title}
                </Text>
                <Text style={[styles.cardMeta, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
              </View>
              <Badge
                label={booking.status === 'attended' ? 'Attended' : booking.status}
                tone={booking.status === 'attended' ? 'navy' : 'grey'}
              />
            </Row>
          </View>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingRight: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pastCard: {
    opacity: 0.8,
    paddingVertical: spacing.md,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.display,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: colors.navy,
    lineHeight: 20,
  },
  cardMeta: {
    fontSize: 12.5,
    fontFamily: fonts.medium,
    color: colors.textFaint,
  },
  cardPaid: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
    color: colors.textMuted,
  },
  soonChip: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1.5,
  },
  soonText: {
    fontSize: 11,
    fontFamily: fonts.extrabold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.coralText,
  },
  walletStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  walletLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.coralBright,
  },
  walletBalance: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textOnDark,
    marginTop: 1,
  },
  walletCta: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textOnDark,
  },
});
