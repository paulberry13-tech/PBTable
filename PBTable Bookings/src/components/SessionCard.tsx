import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CapacityBar, DateBlock, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatMoneyShort } from '@/lib/money';
import { dateBlockParts, formatTimeRange, skillBandLabel, spotsLeft } from '@/lib/format';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { Session, SportProfile } from '@/types';

/**
 * Fixture card — reads like a sports listing, not a form row. The navy date
 * tile anchors the eye; graded/social is colour-coded the same way as the
 * dashboard (coral vs green rule); the capacity strip does the "should I
 * hurry?" job at a glance.
 */
export function SessionCard({ session, profile }: { session: Session; profile: SportProfile }) {
  const router = useRouter();
  const left = spotsLeft(session);
  const full = left === 0;
  const band = skillBandLabel(session);
  const booked = session.capacity - left;
  const parts = dateBlockParts(session.date);
  const kind = session.affectsRating ? 'graded' : 'social';
  const nearlyFull = !full && session.capacity > 0 && booked / session.capacity >= 0.75;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Row gap={spacing.md} style={{ alignItems: 'stretch' }}>
        <DateBlock {...parts} kind={kind} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={spacing.sm}>
            <Text style={styles.title} numberOfLines={2}>
              {session.title}
            </Text>
            {/* The price THIS member pays — a non-member quoted the member rate here
                would be charged more at the tap, and a free taster would look chargeable. */}
            <Text style={[styles.price, (session.yourPricePence ?? session.pricePence) === 0 && { color: colors.upText }]}>
              {session.tasterApplies
                ? 'FREE TASTER'
                : (session.yourPricePence ?? session.pricePence) === 0
                ? 'FREE'
                : formatMoneyShort(session.yourPricePence ?? session.pricePence)}
            </Text>
          </Row>
          <Row style={{ marginTop: 3, flexWrap: 'wrap' }} gap={spacing.sm}>
            <Row gap={4}>
              <Ionicons name="time-outline" size={13} color={colors.textFaint} />
              <Text style={styles.meta}>{formatTimeRange(session)}</Text>
            </Row>
            {session.location ? (
              <Row gap={4} style={{ flexShrink: 1 }}>
                <Ionicons name="location-outline" size={13} color={colors.textFaint} />
                <Text style={styles.meta} numberOfLines={1}>
                  {session.location}
                </Text>
              </Row>
            ) : null}
          </Row>
          <Row style={{ marginTop: 7, flexWrap: 'wrap' }} gap={5}>
            {session.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
            {/* Preview clubs list sessions before booking opens; say so on the card
                rather than letting the tap be the discovery. */}
            {session.bookingOpen === false && session.status === 'upcoming' ? (
              <Badge label={session.bookingOpenedAt ? 'Booking closed' : 'Not open yet'} tone="grey" />
            ) : null}
            {session.format !== 'social' && FORMAT_LABELS[session.format] ? (
              <Badge label={FORMAT_LABELS[session.format]} tone="grey" />
            ) : null}
            {band ? <Badge label={`${profile.terms.rating} ${band}`} tone="navy" /> : null}
          </Row>
        </View>
      </Row>

      <Row style={{ marginTop: spacing.md }} gap={spacing.md}>
        <CapacityBar booked={booked} capacity={session.capacity} />
        {full ? (
          <Text style={[styles.spots, { color: colors.amberText }]}>
            Full{session.waitlist.length > 0 ? ` · ${session.waitlist.length} waiting` : ' · join waitlist'}
          </Text>
        ) : (
          <Text style={[styles.spots, { color: nearlyFull ? colors.amberText : colors.upText }]}>
            {booked} in · {left} {left === 1 ? 'spot' : 'spots'} left
          </Text>
        )}
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: fonts.display,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: colors.navy,
    lineHeight: 21,
  },
  meta: {
    fontSize: 12.5,
    fontFamily: fonts.medium,
    color: colors.textFaint,
  },
  price: {
    fontSize: 17,
    fontFamily: fonts.monoBold,
    fontVariant: ['tabular-nums'],
    color: colors.navy,
  },
  spots: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
    flexShrink: 0,
  },
});
