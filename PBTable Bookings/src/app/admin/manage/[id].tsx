import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, ErrorState, LoadingView, Row } from '@/components/ui';
import { slipRating } from '@/domain/slips';
import { formatSessionWhen, spotsLeft } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { CourtSlipRound, Member, Session } from '@/types';

export default function ManageSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sportProfile, refresh, showBanner } = useApp();
  const [slips, setSlips] = useState<CourtSlipRound[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filling, setFilling] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data: session, error } = useAsyncData(() => data.getSession(id), [id]);
  const { data: members } = useAsyncData(() => data.getMembers());
  const { data: roster } = useAsyncData(() => data.getSessionRoster(id), [id, rosterKey]);
  useAsyncData(async () => {
    const existing = await data.getCourtSlips(id);
    if (existing) setSlips(existing);
    return existing;
  }, [id]);

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  const removePlayer = async (memberId: string, name: string) => {
    if (!session) return;
    setRemovingId(memberId);
    try {
      const res = await data.adminRemoveBooking(session.id, memberId);
      setRosterKey((k) => k + 1);
      refresh();
      const money = res.refundPence > 0 ? ` ${formatMoney(res.refundPence)} refunded.` : '';
      const promo = res.promotedName ? ` ${res.promotedName} promoted from the waitlist.` : '';
      showBanner(`${name} removed.${money}${promo}`);
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not remove player', 'warning');
    } finally {
      setRemovingId(null);
    }
  };

  const cancelSession = async () => {
    if (!session) return;
    setCancelling(true);
    try {
      const res = await data.adminCancelSession(session.id);
      refresh();
      const money =
        res.totalRefundPence > 0
          ? ` ${formatMoney(res.totalRefundPence)} refunded to ${res.attendeesRefunded} ${
              res.attendeesRefunded === 1 ? 'player' : 'players'
            }.`
          : '';
      showBanner(`Session cancelled.${money}`);
      router.back();
    } catch (e) {
      showBanner(e instanceof Error ? e.message : 'Could not cancel session', 'warning');
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!session || !members) return <LoadingView />;

  const bookedRoster = session.bookings.filter((b) => b.status === 'booked' || b.status === 'attended');
  const left = spotsLeft(session);
  const slipTerm = sportProfile.terms.slip.toLowerCase();
  const isUpcoming = session.status === 'upcoming';

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
        <Badge label={`${bookedRoster.length}/${session.capacity} booked`} tone={left === 0 ? 'amber' : 'grey'} />
      </Row>

      {/* ★ The differentiator: balanced court slips */}
      {session.status === 'upcoming' ? (
        <Card style={{ marginTop: spacing.lg, backgroundColor: colors.navy, borderColor: colors.navy }}>
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
        {roster == null ? (
          <Text style={type.caption}>Loading roster…</Text>
        ) : roster.length === 0 ? (
          <Text style={type.caption}>No bookings yet.</Text>
        ) : (
          roster.map((r) => (
            <Row key={r.memberId} style={{ justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{r.name}</Text>
              </View>
              <Text style={[type.caption, type.mono, { marginRight: spacing.md }]}>
                {r.rating != null ? r.rating.toFixed(2) : `est ${r.slipRating.toFixed(1)}`}
              </Text>
              {isUpcoming ? (
                removingId === r.memberId ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Pressable
                    onPress={() => void removePlayer(r.memberId, r.name)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${r.name}`}
                  >
                    <Text style={styles.removeLink}>Remove</Text>
                  </Pressable>
                )
              ) : null}
            </Row>
          ))
        )}
        {left > 0 && isUpcoming ? (
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

      {isUpcoming ? (
        <View style={styles.dangerZone}>
          {!confirmingCancel ? (
            <Button
              title="Cancel session"
              variant="ghost"
              onPress={() => setConfirmingCancel(true)}
            />
          ) : (
            <Card style={{ borderColor: colors.down }}>
              <Text style={type.bodyBold}>Cancel this session?</Text>
              <Text style={[type.caption, { marginTop: 4 }]}>
                Every booked player is refunded their fee to their wallet. This can’t be undone.
              </Text>
              <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
                <Button
                  title="Keep session"
                  variant="ghost"
                  onPress={() => setConfirmingCancel(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={cancelling ? 'Cancelling…' : 'Cancel & refund all'}
                  variant="danger"
                  onPress={() => void cancelSession()}
                  loading={cancelling}
                  style={{ flex: 1 }}
                />
              </Row>
            </Card>
          )}
        </View>
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
        <Text style={[type.tiny, { color: colors.coralText }]}>{courtLabel.toUpperCase()}</Text>
        <Text style={[type.tiny, type.mono, { letterSpacing: 0 }]}>
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
        <Text style={{ fontSize: 11, fontFamily: fonts.extrabold, color: colors.textFaint }}>vs</Text>
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
  removeLink: {
    ...type.caption,
    color: colors.down,
    fontFamily: fonts.bold,
  },
  dangerZone: {
    marginTop: spacing.xl,
  },
  slipCourt: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
