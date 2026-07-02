import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Row } from '@/components/ui';
import { FORMAT_LABELS } from '@/domain/sportProfile';
import { formatSessionWhen, skillBandLabel, spotsLeft } from '@/lib/format';
import { formatPence } from '@/services/payments';
import { colors, radius, shadow, spacing, type } from '@/theme';
import { Session, SportProfile } from '@/types';

export function SessionCard({ session, profile }: { session: Session; profile: SportProfile }) {
  const router = useRouter();
  const left = spotsLeft(session);
  const full = left === 0;
  const band = skillBandLabel(session);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={type.h2}>{session.title}</Text>
          <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
        </View>
        <Text style={[styles.price, session.pricePence === 0 && { color: colors.up }]}>
          {formatPence(session.pricePence)}
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

      <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
        <Row gap={4}>
          <Ionicons name="grid-outline" size={14} color={colors.textMuted} />
          <Text style={type.caption}>
            {session.courts} {session.courts === 1 ? profile.terms.court.toLowerCase() : `${profile.terms.court.toLowerCase()}s`}
          </Text>
        </Row>
        {full ? (
          <Row gap={4}>
            <Ionicons name="time-outline" size={14} color={colors.amber} />
            <Text style={[type.caption, { color: colors.amber, fontWeight: '700' }]}>
              Full — waitlist{session.waitlist.length > 0 ? ` (${session.waitlist.length})` : ''}
            </Text>
          </Row>
        ) : (
          <Text style={[type.caption, { color: colors.up, fontWeight: '700' }]}>
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
    ...shadow.card,
  },
  price: {
    ...type.h2,
    ...type.mono,
    color: colors.navy,
  },
});
