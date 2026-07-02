import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, ErrorState, LoadingView, Row } from '@/components/ui';
import { slipRating } from '@/domain/slips';
import { formatSessionWhen, spotsLeft } from '@/lib/format';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, radius, spacing, type } from '@/theme';
import { CourtSlipRound, Member, Session } from '@/types';

export default function ManageSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sportProfile, refresh, showBanner } = useApp();
  const [slips, setSlips] = useState<CourtSlipRound[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filling, setFilling] = useState(false);

  const { data: session, error } = useAsyncData(() => data.getSession(id), [id]);
  const { data: members } = useAsyncData(() => data.getMembers());
  useAsyncData(async () => {
    const existing = await data.getCourtSlips(id);
    if (existing) setSlips(existing);
    return existing;
  }, [id]);

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  if (error) return <ErrorState message={error} />;
  if (!session || !members) return <LoadingView />;

  const roster = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  const left = spotsLeft(session);
  const slipTerm = sportProfile.terms.slip.toLowerCase();

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await data.generateCourtSlips(session.id, 3);
      setSlips(result);
      showBanner(`Balanced ${slipTerm}s generated for ${result.length} rounds.`);
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not generate slips', 'warning');
    } finally {
      setGenerating(false);
    }
  };

  const fillDemo = async () => {
    setFilling(true);
    try {
      const added = await data.demoFillSession(session.id);
      refresh();
      showBanner(`${added} demo players booked in.`);
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not add players', 'warning');
    } finally {
      setFilling(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>{session.title}</Text>
      <Text style={[type.caption, { marginTop: 2 }]}>{formatSessionWhen(session)}</Text>
      <Row gap={6} style={{ marginTop: spacing.sm }}>
        {session.affectsRating ? <Badge label="Graded" tone="coral" /> : <Badge label="Social" tone="green" />}
        <Badge label={`${roster.length}/${session.capacity} booked`} tone={left === 0 ? 'amber' : 'grey'} />
      </Row>

      {/* ★ The differentiator: balanced court slips */}
      {session.status === 'upcoming' ? (
        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.navy }}>
          <Text style={[type.h2, { color: colors.textOnDark }]}>Balanced {slipTerm}s</Text>
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.75)', marginTop: 4 }]}>
            Fair teams from {sportProfile.terms.rating} — strong paired with developing, no repeated
            partners.
          </Text>
          <Button
            title={
              generating
                ? 'Balancing teams…'
                : slips
                  ? `Regenerate ${slipTerm}s`
                  : `Generate balanced ${slipTerm}s`
            }
            onPress={() => void generate()}
            loading={generating}
            style={{ marginTop: spacing.md }}
          />
          {session.affectsRating ? (
            <Button
              title="Enter scores"
              variant="ghost"
              onPress={() => router.push({ pathname: '/admin/scores/[id]', params: { id: session.id } })}
              style={{ marginTop: spacing.sm, backgroundColor: colors.card }}
            />
          ) : null}
        </Card>
      ) : null}

      {slips ? (
        <View style={{ marginTop: spacing.lg }}>
          {slips.map((round) => (
            <Card key={round.round} style={{ marginBottom: spacing.md }}>
              <Text style={type.h2}>Round {round.round}</Text>
              {round.courts.map((c) => (
                <SlipCourt
                  key={c.court}
                  courtLabel={`${sportProfile.terms.court} ${c.court}`}
                  team1={c.team1.map((pid) => membersById.get(pid))}
                  team2={c.team2.map((pid) => membersById.get(pid))}
                  session={session}
                />
              ))}
              {round.resting && round.resting.length > 0 ? (
                <Text style={[type.tiny, { marginTop: spacing.sm }]}>
                  Resting: {round.resting.map((pid) => membersById.get(pid)?.name ?? '…').join(', ')}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Roster</Text>
      <Card>
        {roster.length === 0 ? (
          <Text style={type.caption}>No bookings yet.</Text>
        ) : (
          roster.map((b) => {
            const m = membersById.get(b.memberId);
            return (
              <Row key={b.id} style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={type.body}>{m?.name ?? '…'}</Text>
                <Text style={[type.caption, type.mono]}>
                  {m?.rating !== undefined
                    ? m.rating.toFixed(2)
                    : m
                      ? `est ${slipRating(m, session).toFixed(1)}`
                      : ''}
                </Text>
              </Row>
            );
          })
        )}
        {left > 0 && session.status === 'upcoming' ? (
          <Button
            title={filling ? 'Booking players…' : '＋ Add demo players'}
            variant="ghost"
            onPress={() => void fillDemo()}
            loading={filling}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Card>

      {session.waitlist.length > 0 ? (
        <>
          <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Waitlist</Text>
          <Card>
            {session.waitlist.map((pid, i) => (
              <Row key={pid} style={{ marginBottom: 6 }} gap={spacing.md}>
                <Text style={[type.caption, type.mono]}>{i + 1}</Text>
                <Text style={type.body}>{membersById.get(pid)?.name ?? '…'}</Text>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function SlipCourt({
  courtLabel,
  team1,
  team2,
  session,
}: {
  courtLabel: string;
  team1: (Member | undefined)[];
  team2: (Member | undefined)[];
  session: Session;
}) {
  const avg = (team: (Member | undefined)[]) => {
    const rated = team.filter((m): m is Member => !!m);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, m) => sum + slipRating(m, session), 0) / rated.length;
  };
  return (
    <View style={styles.slipCourt}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[type.tiny, { color: colors.coral }]}>{courtLabel.toUpperCase()}</Text>
        <Text style={[type.tiny, type.mono]}>
          {avg(team1).toFixed(2)} v {avg(team2).toFixed(2)}
        </Text>
      </Row>
      <Row style={{ marginTop: 4, alignItems: 'center' }} gap={spacing.sm}>
        <View style={{ flex: 1 }}>
          {team1.map((m, i) => (
            <Text key={i} style={type.body} numberOfLines={1}>
              {m?.name ?? '…'}
            </Text>
          ))}
        </View>
        <Text style={[type.caption, { fontWeight: '800', color: colors.textFaint }]}>vs</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {team2.map((m, i) => (
            <Text key={i} style={type.body} numberOfLines={1}>
              {m?.name ?? '…'}
            </Text>
          ))}
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  slipCourt: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
