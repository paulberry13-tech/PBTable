import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopUpSheet } from '@/components/TopUpSheet';
import { Badge, Button, Card, ErrorState, LoadingView, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { formatDateLong, formatTimeRange, skillBandLabel, spotsLeft } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, spacing, type } from '@/theme';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, role, sportProfile, refresh, showBanner } = useApp();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [shortfallPence, setShortfallPence] = useState(0);
  const [booking, setBooking] = useState(false);

  const { data: session, error } = useAsyncData(() => data.getSession(id), [id]);
  const { data: members } = useAsyncData(() => data.getMembers());
  const { data: balance } = useAsyncData(
    () => (currentUser ? data.getBalance(currentUser.id) : Promise.resolve(0)),
    [currentUser?.id]
  );

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  if (error) return <ErrorState message={error} />;
  if (!session || !currentUser) return <LoadingView />;

  const left = spotsLeft(session);
  const full = left === 0;
  const band = skillBandLabel(session);
  const roster = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  const myBooking = session.bookings.find(
    (b) => b.memberId === currentUser.id && (b.status === 'booked' || b.status === 'waitlisted')
  );
  const outsideBand =
    session.skillMin !== undefined &&
    currentUser.rating !== undefined &&
    (currentUser.rating < (session.skillMin ?? 0) || currentUser.rating > (session.skillMax ?? 99));

  const balancePence = balance ?? 0;
  const cost = session.pricePence;
  const canAfford = balancePence >= cost;

  const completeBooking = async () => {
    setBooking(true);
    try {
      const result = await data.bookSession(session.id, currentUser.id);
      refresh();
      if (result.waitlisted) {
        showBanner(`You're #${result.position} on the waitlist for ${session.title}.`, 'info');
      } else if (cost > 0) {
        showBanner(`Booked! ${formatMoneyShort(cost)} drawn from your balance.`, 'success');
      } else {
        showBanner(`Booked! See you at ${session.title}.`, 'success');
      }
      if (router.canGoBack()) router.back();
      else router.replace('/bookings');
    } catch (e) {
      if (e instanceof data.InsufficientBalanceError) {
        // Balance moved under us (e.g. concurrent booking) — send to top-up.
        setShortfallPence(e.shortfallPence);
        setTopUpOpen(true);
      } else {
        showBanner(e instanceof Error ? e.message : 'Booking failed', 'warning');
      }
    } finally {
      setBooking(false);
    }
  };

  const onBookPress = () => {
    if (full || cost === 0 || canAfford) {
      void completeBooking();
    } else {
      setShortfallPence(cost - balancePence);
      setTopUpOpen(true);
    }
  };

  const onTopUp = async (amountPence: number) => {
    await data.topUp(currentUser.id, amountPence);
    refresh();
    setTopUpOpen(false);
    await completeBooking();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>{session.title}</Text>
      <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }} gap={6}>
        {session.format !== 'social' ? (
          <Badge label={FORMAT_LABELS[session.format] ?? session.format} tone="grey" />
        ) : null}
        {session.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
        {band ? <Badge label={`${sportProfile.terms.rating} ${band}`} tone="navy" /> : null}
        {session.isRecurring ? <Badge label="Weekly" tone="grey" /> : null}
      </Row>

      <Card style={{ marginTop: spacing.lg }}>
        <InfoRow icon="calendar-outline" text={formatDateLong(session.date)} />
        <InfoRow icon="time-outline" text={formatTimeRange(session)} />
        <InfoRow
          icon="grid-outline"
          text={`${session.courts} ${sportProfile.terms.court.toLowerCase()}s · capacity ${session.capacity}`}
        />
        <InfoRow icon="pricetag-outline" text={cost === 0 ? 'Free' : formatMoneyShort(cost)} />
        {session.affectsRating ? (
          <InfoRow
            icon="trending-up-outline"
            text={`Counts towards your ${sportProfile.terms.rating}`}
          />
        ) : (
          <InfoRow icon="happy-outline" text={`Just for fun — no ${sportProfile.terms.rating} impact`} />
        )}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>Who's playing</Text>
          <Text style={[type.captionBold, type.mono, full && { color: colors.amberText }]}>
            {roster.length}/{session.capacity}
            {full ? ' · Full' : ''}
          </Text>
        </Row>
        {roster.map((b) => {
          const m = membersById.get(b.memberId);
          return (
            <Row key={b.id} style={{ marginTop: spacing.sm, justifyContent: 'space-between' }}>
              <Text style={type.body}>{m?.name ?? '…'}</Text>
              <Text style={[type.caption, type.mono]}>
                {m?.rating !== undefined ? m.rating.toFixed(2) : 'Unrated'}
              </Text>
            </Row>
          );
        })}
        {session.waitlist.length > 0 ? (
          <Text style={[type.captionBold, { marginTop: spacing.md, color: colors.amberText }]}>
            +{session.waitlist.length} on the waitlist
          </Text>
        ) : null}
      </Card>

      {outsideBand ? (
        <Text style={[type.caption, { marginTop: spacing.md, color: colors.amberText }]}>
          Heads-up: your {sportProfile.terms.rating} ({currentUser.rating?.toFixed(2)}) is outside this
          session's band — you can still book for the demo.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        {myBooking ? (
          <Card style={{ backgroundColor: colors.upSoft, borderColor: 'transparent' }}>
            <Text style={[type.h2, { color: colors.upText }]}>
              {myBooking.status === 'waitlisted' ? "You're on the waitlist" : "You're booked in"}
            </Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              Manage or cancel from the My Bookings tab.
            </Text>
          </Card>
        ) : (
          <>
            <Button
              title={
                full
                  ? 'Join waitlist'
                  : cost === 0
                    ? 'Book — free'
                    : canAfford
                      ? `Book · ${formatMoneyShort(cost)}`
                      : `Top up & book · ${formatMoneyShort(cost)}`
              }
              onPress={onBookPress}
              loading={booking}
              variant={full ? 'secondary' : 'primary'}
            />
            {!full && cost > 0 ? (
              <Text style={styles.balanceLine}>
                Balance {formatMoney(balancePence)}
                {canAfford ? '' : ' — top up to book'}
              </Text>
            ) : null}
          </>
        )}
        {role === 'admin' ? (
          <Button
            title="Manage session (admin)"
            variant="ghost"
            onPress={() => router.push({ pathname: '/admin/manage/[id]', params: { id: session.id } })}
          />
        ) : null}
      </View>

      <TopUpSheet
        visible={topUpOpen}
        minPence={shortfallPence}
        reason={`This session costs ${formatMoneyShort(cost)}. Top up to book ${session.title}.`}
        onConfirm={onTopUp}
        onClose={() => setTopUpOpen(false)}
      />
    </ScrollView>
  );
}

function InfoRow({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <Row style={{ marginTop: 6 }} gap={10}>
      <Ionicons name={icon} size={17} color={colors.coral} />
      <Text style={type.body}>{text}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  balanceLine: {
    ...type.caption,
    textAlign: 'center',
  },
});
