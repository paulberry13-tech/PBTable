import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, CapacityBar, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatMoneyShort } from '@/lib/money';
import { formatSessionWhen, skillBandLabel, spotsLeft } from '@/lib/format';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';
import { Session, SportProfile } from '@/types';

export function SessionCard({ session, profile }: { session: Session; profile: SportProfile }) {
  const router = useRouter();
  const left = spotsLeft(session);
  const full = left === 0;
  const band = skillBandLabel(session);
  const booked = session.capacity - left;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={type.h2}>{session.title}</Text>
          <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
        </View>
        <Text style={[styles.price, session.pricePence === 0 && { color: colors.upText }]}>
          {session.pricePence === 0 ? 'Free' : formatMoneyShort(session.pricePence)}
        </Text>
      </Row>

      <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }} gap={6}>
        {session.format !== 'social' ? (
          <Badge label={FORMAT_LABELS[session.format] ?? session.format} tone="grey" />
        ) : null}
        {session.affectsRating ? (
          <Badge label="Graded" tone="coral" />
        ) : (
          <Badge label="Social" tone="green" />
        )}
        {band ? <Badge label={`${profile.terms.rating} ${band}`} tone="navy" /> : null}
        {session.isRecurring ? <Badge label="Weekly" tone="grey" /> : null}
      </Row>

      <Row style={{ marginTop: spacing.lg }} gap={spacing.md}>
        <CapacityBar booked={booked} capacity={session.capacity} />
        {full ? (
          <Text style={[styles.spots, { color: colors.amberText }]}>
            Full · waitlist{session.waitlist.length > 0 ? ` ${session.waitlist.length}` : ''}
          </Text>
        ) : (
          <Text style={[styles.spots, { color: colors.upText }]}>
            {left} {left === 1 ? 'spot' : 'spots'} left
          </Text>
        )}
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  price: {
    fontSize: 18,
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
