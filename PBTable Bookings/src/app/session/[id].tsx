import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopUpSheet } from '@/components/TopUpSheet';
import { Avatar, Badge, Button, Card, CapacityBar, DateBlock, ErrorState, LoadingView, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { dateBlockParts, formatTimeRange, initialsOf, skillBandLabel, spotsLeft } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, sportProfile, refresh, showBanner } = useApp();
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
  // Booking can be closed on a session that hasn't happened yet (line-up built, or the
  // club hasn't opened it). The list only shows open ones, but you can still reach this
  // screen from My Bookings or a stale link — without this the Book button would look
  // live and `book_spot` would reject it with a raw error.
  const closed = session.bookingOpen === false || session.status !== 'upcoming';
  const band = skillBandLabel(session);
  const parts = dateBlockParts(session.date);
  const kind = session.affectsRating ? 'graded' : 'social';
  const roster = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  // Prefer the real attendee names (live backend); fall back to the local roster.
  const playing =
    session.attendees ??
    roster.map((b) => {
      const m = membersById.get(b.memberId);
      return { memberId: b.memberId, name: m?.name ?? '…', rating: m?.rating ?? null, status: b.status };
    });
  const myBooking = session.bookings.find(
    (b) => b.memberId === currentUser.id && (b.status === 'booked' || b.status === 'waitlisted')
  );
  const outsideBand =
    session.skillMin !== undefined &&
    currentUser.rating !== undefined &&
    (currentUser.rating < (session.skillMin ?? 0) || currentUser.rating > (session.skillMax ?? 99));

  const balancePence = balance ?? 0;
  // What THIS member pays: member vs non-member rate, and £0 when a free taster
  // applies. Falls back to the session's member price in mock mode, which has no
  // server-side pricing. Quoting session.pricePence here showed a non-member the
  // member rate and then charged them the higher one at the tap.
  const cost = session.yourPricePence ?? session.pricePence;
  const taster = !!session.tasterApplies;
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
      {/* Fixture hero — the match poster. Navy chrome, kind-coloured rule, big Oswald title. */}
      <View style={styles.hero}>
        <View style={[styles.heroRule, { backgroundColor: kind === 'graded' ? colors.coral : colors.up }]} />
        <Row gap={spacing.lg} style={{ alignItems: 'flex-start' }}>
          <DateBlock {...parts} kind={kind} size="lg" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{session.title}</Text>
            <Row style={{ marginTop: 6, flexWrap: 'wrap' }} gap={spacing.md}>
              <Row gap={5}>
                <Ionicons name="time-outline" size={14} color={colors.coralBright} />
                <Text style={styles.heroMeta}>{formatTimeRange(session)}</Text>
              </Row>
              {session.courts > 0 ? (
                <Row gap={5}>
                  <Ionicons name="grid-outline" size={14} color={colors.coralBright} />
                  <Text style={styles.heroMeta}>
                    {session.courts} {sportProfile.terms.court.toLowerCase()}
                    {session.courts === 1 ? '' : 's'}
                  </Text>
                </Row>
              ) : null}
            </Row>
            {session.location ? (
              <Row gap={5} style={{ marginTop: 4 }}>
                <Ionicons name="location-outline" size={14} color={colors.coralBright} />
                <Text style={[styles.heroMeta, { flexShrink: 1 }]} numberOfLines={2}>
                  {session.location}
                </Text>
              </Row>
            ) : null}
            <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }} gap={5}>
              {session.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
              {session.format !== 'social' && FORMAT_LABELS[session.format] ? (
                <Badge label={FORMAT_LABELS[session.format]} tone="grey" />
              ) : null}
              {band ? <Badge label={`${sportProfile.terms.rating} ${band}`} tone="grey" /> : null}
            </Row>
          </View>
        </Row>
        <Row style={{ marginTop: spacing.lg, alignItems: 'center' }} gap={spacing.md}>
          <CapacityBar booked={playing.length} capacity={session.capacity} />
          <Text style={styles.heroSpots}>
            {full ? 'FULL' : `${left} LEFT`}
          </Text>
        </Row>
        <Text style={[styles.heroMeta, { marginTop: 6 }]}>
          {session.affectsRating
            ? `Counts towards your ${sportProfile.terms.rating}`
            : `Just for fun — no ${sportProfile.terms.rating} impact`}
        </Text>
      </View>

      {/* Who's playing — faces first, numbers second. */}
      <Card style={{ marginTop: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>Who's playing</Text>
          <Text style={[type.captionBold, type.mono, full && { color: colors.amberText }]}>
            {playing.length}/{session.capacity}
            {full ? ' · Full' : ''}
          </Text>
        </Row>
        {playing.length === 0 ? (
          <Text style={[type.caption, { marginTop: spacing.sm }]}>No one's booked in yet — be the first.</Text>
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            {playing.map((p, i) => (
              <Row key={`${p.memberId}-${i}`} style={styles.playerRow} gap={spacing.md}>
                <Avatar initials={initialsOf(p.name)} index={i} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {p.name}
                </Text>
                {session.affectsRating && p.rating != null ? (
                  <Text style={[type.captionBold, type.mono]}>{p.rating.toFixed(2)}</Text>
                ) : null}
              </Row>
            ))}
          </View>
        )}
        {session.waitlist.length > 0 ? (
          <Text style={[type.captionBold, { marginTop: spacing.sm, color: colors.amberText }]}>
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

      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
        {myBooking ? (
          <Card style={{ backgroundColor: colors.upSoft, borderColor: 'transparent' }}>
            <Text style={[type.h2, { color: colors.upText }]}>
              {myBooking.status === 'waitlisted' ? "You're on the waitlist" : "You're booked in"}
            </Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              Manage or cancel from the My Bookings tab.
            </Text>
          </Card>
        ) : closed ? (
          <Card>
            <Text style={type.h2}>
              {session.status === 'completed'
                ? 'This session has finished'
                : session.status === 'in_progress'
                  ? 'This session is under way'
                  : 'Booking is closed'}
            </Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              {session.status === 'upcoming'
                ? 'The club isn’t taking bookings for this one. Check with them if you think that’s wrong.'
                : 'You can’t book a spot any more.'}
            </Text>
          </Card>
        ) : (
          <>
            {/* The money, laid out BEFORE the button — no surprises at the tap. */}
            {!full && taster ? (
              <Card style={{ paddingVertical: spacing.md }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={type.bodyBold}>Free taster</Text>
                  <Text style={[type.bodyBold, { color: colors.upText }]}>
                    {formatMoneyShort(0)}
                  </Text>
                </Row>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  Your first session is on the club — nothing comes off your balance.
                </Text>
              </Card>
            ) : !full && cost > 0 ? (
              <Card style={{ paddingVertical: spacing.md }}>
                <MathsRow label="Price" value={formatMoneyShort(cost)} />
                <MathsRow label="Your balance" value={formatMoney(balancePence)} />
                <View style={styles.mathsRule} />
                {canAfford ? (
                  <MathsRow label="Balance after booking" value={formatMoney(balancePence - cost)} strong />
                ) : (
                  <MathsRow
                    label="You need to top up"
                    value={formatMoney(cost - balancePence)}
                    strong
                    tint={colors.coralText}
                  />
                )}
              </Card>
            ) : null}
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
            {full ? (
              <Text style={[type.caption, { textAlign: 'center' }]}>
                Nothing is charged while you wait — you only pay if a spot frees up.
              </Text>
            ) : null}
          </>
        )}
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

function MathsRow({
  label, value, strong, tint,
}: { label: string; value: string; strong?: boolean; tint?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={strong ? type.bodyBold : type.body}>{label}</Text>
      <Text
        style={[
          strong ? type.bodyBold : type.body,
          { fontFamily: fonts.monoBold, fontVariant: ['tabular-nums'] },
          tint ? { color: tint } : null,
        ]}
      >
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadow.raised,
  },
  heroRule: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 4,
  },
  heroTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    lineHeight: 28,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textOnDark,
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textOnDarkMuted,
  },
  heroSpots: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textOnDark,
  },
  playerRow: {
    paddingVertical: 6,
  },
  mathsRule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
});
