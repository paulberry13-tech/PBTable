import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, LoadingView, Row } from '@/components/ui';
import { RatingChange } from '@/domain/ratings';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

interface ScoreDraft {
  key: string;
  round: number;
  court: number;
  team1: [string, string];
  team2: [string, string];
  score1: string;
  score2: string;
}

export default function EnterScoresScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sportProfile, refresh, showBanner } = useApp();
  const [drafts, setDrafts] = useState<ScoreDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<RatingChange[] | null>(null);

  const { data: session, error } = useAsyncData(() => data.getSession(id), [id]);
  const { data: members } = useAsyncData(() => data.getMembers());
  const { data: slips, loading: slipsLoading } = useAsyncData(() => data.getCourtSlips(id), [id]);

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  // Build editable drafts from the generated slips, once.
  if (slips && drafts === null) {
    setDrafts(
      slips.flatMap((round) =>
        round.courts.map((c) => ({
          key: `${round.round}-${c.court}`,
          round: round.round,
          court: c.court,
          team1: c.team1,
          team2: c.team2,
          score1: '',
          score2: '',
        }))
      )
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!session || !members || slipsLoading) return <LoadingView />;

  if (!session.affectsRating) {
    return (
      <EmptyState
        title="Not a graded session"
        hint={`Social ${sportProfile.terms.session.toLowerCase()}s never touch ${sportProfile.terms.rating}.`}
      />
    );
  }

  if (!slips) {
    return (
      <EmptyState
        title={`No ${sportProfile.terms.slip.toLowerCase()}s yet`}
        hint={`Generate balanced ${sportProfile.terms.slip.toLowerCase()}s from the Manage screen first — scores are entered per ${sportProfile.terms.court.toLowerCase()}.`}
      />
    );
  }

  const name = (pid: string) => membersById.get(pid)?.name.split(' ')[0] ?? '…';
  const teamLabel = (team: [string, string]) => `${name(team[0])} & ${name(team[1])}`;

  const setScore = (key: string, side: 'score1' | 'score2', value: string) => {
    setDrafts((ds) => (ds ?? []).map((d) => (d.key === key ? { ...d, [side]: value } : d)));
  };

  const save = async () => {
    const entries = (drafts ?? [])
      .map((d) => ({
        team1: d.team1,
        team2: d.team2,
        score1: parseInt(d.score1, 10) || 0,
        score2: parseInt(d.score2, 10) || 0,
      }))
      .filter((e) => e.score1 + e.score2 > 0);
    if (entries.length === 0) {
      showBanner('Enter at least one score first.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const result = await data.enterScores(session.id, entries);
      setChanges(result);
      refresh();
      showBanner(`Scores saved — ${sportProfile.terms.rating} updated for ${new Set(result.map((c) => c.memberId)).size} players.`);
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not save scores', 'warning');
    } finally {
      setSaving(false);
    }
  };

  // After saving: show the rating movement summary — the loop made visible.
  if (changes) {
    const byMember = new Map<string, number>();
    changes.forEach((c) => byMember.set(c.memberId, (byMember.get(c.memberId) ?? 0) + c.delta));
    const sorted = [...byMember.entries()].sort((a, b) => b[1] - a[1]);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={type.display}>Ratings updated</Text>
        <Text style={[type.caption, { marginTop: 2 }]}>
          {sportProfile.terms.rating} movement from {session.title}
        </Text>
        <Card style={{ marginTop: spacing.lg }}>
          {sorted.map(([memberId, delta]) => {
            const m = membersById.get(memberId);
            const flat = Math.abs(delta) < 0.0005;
            const up = delta > 0;
            const colour = flat ? colors.textFaint : up ? colors.upText : colors.downText;
            return (
              <Row key={memberId} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={type.body}>{m?.name ?? memberId}</Text>
                <Row gap={4}>
                  {flat ? null : (
                    <Ionicons name={up ? 'caret-up' : 'caret-down'} size={14} color={colour} />
                  )}
                  <Text style={[type.monoBold, { fontSize: 14, color: colour }]}>
                    {flat ? '—' : `${up ? '+' : ''}${delta.toFixed(3)}`}
                  </Text>
                </Row>
              </Row>
            );
          })}
        </Card>
        <Button
          title="See the leaderboard reshuffle"
          onPress={() => router.replace('/leaderboard')}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    );
  }

  let lastRound = 0;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Enter scores</Text>
      <Text style={[type.caption, { marginTop: 2 }]}>
        {session.title} — saving runs the {sportProfile.terms.rating} update live.
      </Text>

      {(drafts ?? []).map((d) => {
        const showRound = d.round !== lastRound;
        lastRound = d.round;
        return (
          <View key={d.key}>
            {showRound ? (
              <Text style={[type.h1, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                Round {d.round}
              </Text>
            ) : null}
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={[type.tiny, { color: colors.coralText }]}>
                {sportProfile.terms.court.toUpperCase()} {d.court}
              </Text>
              <Row style={{ marginTop: spacing.sm }} gap={spacing.md}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {teamLabel(d.team1)}
                  </Text>
                </View>
                <TextInput
                  style={styles.scoreInput}
                  value={d.score1}
                  onChangeText={(v) => setScore(d.key, 'score1', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  maxLength={2}
                />
              </Row>
              <Row style={{ marginTop: spacing.sm }} gap={spacing.md}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>
                    {teamLabel(d.team2)}
                  </Text>
                </View>
                <TextInput
                  style={styles.scoreInput}
                  value={d.score2}
                  onChangeText={(v) => setScore(d.key, 'score2', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  maxLength={2}
                />
              </Row>
            </Card>
          </View>
        );
      })}

      <Button
        title={saving ? 'Updating ratings…' : `Save scores & update ${sportProfile.terms.rating}`}
        onPress={() => void save()}
        loading={saving}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  scoreInput: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    width: 64,
    minHeight: 44,
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 18,
    fontFamily: fonts.monoBold,
    color: colors.navy,
    backgroundColor: colors.card,
  },
});
