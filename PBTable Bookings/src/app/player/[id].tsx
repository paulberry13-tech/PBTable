import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Sparkline } from '@/components/Sparkline';
import { Badge, Card, ErrorState, LoadingView, Row } from '@/components/ui';
import { formatDate } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, spacing, type } from '@/theme';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sportProfile } = useApp();
  const { width } = useWindowDimensions();

  const { data: member, error } = useAsyncData(() => data.getMember(id), [id]);
  const { data: recentMatches } = useAsyncData(() => data.getMemberMatches(id), [id]);

  if (error) return <ErrorState message={error} />;
  if (!member) return <LoadingView />;

  const unrated = member.ratingState === 'unrated';
  const streak = member.streak ?? 0;
  const form = (recentMatches ?? []).slice(0, 8).map(({ match }) => {
    const onTeam1 = match.team1.includes(member.id);
    const won = onTeam1 ? match.score1 > match.score2 : match.score2 > match.score1;
    return won;
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={type.display}>{member.name}</Text>
          <Row gap={6} style={{ marginTop: spacing.sm }}>
            {member.memberType === 'guest' ? <Badge label="Guest" tone="grey" /> : null}
            {member.memberType === 'junior' ? <Badge label="Junior" tone="navy" /> : null}
            {member.ratingState === 'provisional' ? <Badge label="Provisional" tone="amber" /> : null}
            {streak >= 3 ? <Badge label={`HOT 🔥 ${streak} wins`} tone="coral" /> : null}
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.bigRating}>{unrated ? '—' : member.rating?.toFixed(2)}</Text>
          <Text style={type.tiny}>{sportProfile.terms.rating.toUpperCase()}</Text>
        </View>
      </Row>

      {unrated ? (
        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.coralSoft, borderColor: 'transparent' }}>
          <Text style={[type.h2, { color: colors.coralText }]}>Unrated</Text>
          <Text style={[type.body, { marginTop: 4 }]}>
            Play a graded {sportProfile.terms.session.toLowerCase()} to earn a{' '}
            {sportProfile.terms.rating}.
          </Text>
        </Card>
      ) : (
        <>
          <Row gap={spacing.md} style={{ marginTop: spacing.lg }}>
            <StatCard label="Graded games" value={String(member.gradedGames)} />
            <StatCard
              label="Win rate"
              value={member.winRate !== undefined ? `${Math.round(member.winRate * 100)}%` : '—'}
            />
            <StatCard
              label="Streak"
              value={streak === 0 ? '—' : streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`}
              color={streak > 0 ? colors.upText : streak < 0 ? colors.downText : undefined}
            />
          </Row>

          {(member.ratingHistory?.length ?? 0) >= 2 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={type.h2}>{sportProfile.terms.rating} history</Text>
              <View style={{ marginTop: spacing.md, alignItems: 'center' }}>
                <Sparkline
                  points={member.ratingHistory ?? []}
                  width={Math.min(width, 720) - spacing.lg * 4}
                  height={80}
                />
              </View>
              <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
                <Text style={type.tiny}>{formatDate(member.ratingHistory![0].date)}</Text>
                <Text style={type.tiny}>
                  {formatDate(member.ratingHistory![member.ratingHistory!.length - 1].date)}
                </Text>
              </Row>
            </Card>
          ) : null}

          {form.length > 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={type.h2}>Recent form</Text>
              <Row gap={6} style={{ marginTop: spacing.md }}>
                {form.map((won, i) => (
                  <View
                    key={i}
                    style={[styles.formDot, { backgroundColor: won ? colors.up : colors.down }]}
                  >
                    <Text style={styles.formDotText}>{won ? 'W' : 'L'}</Text>
                  </View>
                ))}
              </Row>
              <Text style={[type.tiny, { marginTop: spacing.sm }]}>Most recent first</Text>
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md }}>
      <Text style={[type.monoBold, { fontSize: 19, color: color ?? colors.navy }]}>{value}</Text>
      <Text style={[type.tiny, { marginTop: 3 }]}>{label.toUpperCase()}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  bigRating: {
    ...type.monoBold,
    fontSize: 38,
    color: colors.navy,
  },
  formDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formDotText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontFamily: fonts.extrabold,
  },
});
