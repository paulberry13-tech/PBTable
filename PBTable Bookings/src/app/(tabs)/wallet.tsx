import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopUpSheet } from '@/components/TopUpSheet';
import { Button, Card, EmptyState, LoadingView, Row } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { DEMO_AUTOLOGIN, STRIPE_TOPUP, USE_SUPABASE } from '@/services/config';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { LedgerEntry } from '@/types';

export default function WalletScreen() {
  const { currentUser, refresh, showBanner, signOut } = useApp();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { data: balance, loading: balLoading } = useAsyncData(
    () => (currentUser ? data.getBalance(currentUser.id) : Promise.resolve(0)),
    [currentUser?.id]
  );
  const { data: ledger, loading: ledgerLoading } = useAsyncData(
    () => (currentUser ? data.getLedger(currentUser.id) : Promise.resolve([])),
    [currentUser?.id]
  );

  if ((balLoading && balance === null) || !currentUser) {
    return <LoadingView label="Loading your wallet…" />;
  }

  const pence = balance ?? 0;

  const doTopUp = async (amountPence: number) => {
    await data.topUp(currentUser.id, amountPence);
    refresh();
    setTopUpOpen(false);
    showBanner(`${formatMoney(amountPence)} added to your balance.`, 'success');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Wallet</Text>

      <View style={styles.balanceCard}>
        <View style={styles.balanceRule} />
        <Text style={styles.balanceLabel}>BALANCE</Text>
        <Text style={styles.balanceMoney}>{formatMoney(pence)}</Text>
        <Text style={styles.balanceHint}>
          {pence === 0 ? 'Top up to book your first session.' : 'Sessions are paid from this balance.'}
        </Text>
        <Button
          title="Top up"
          onPress={() => setTopUpOpen(true)}
          style={{ marginTop: spacing.lg, alignSelf: 'flex-start', paddingHorizontal: spacing.xxl }}
        />
        {STRIPE_TOPUP ? (
          <Row style={{ marginTop: spacing.md }} gap={6}>
            <Ionicons name="lock-closed" size={12} color={colors.textOnDarkMuted} />
            <Text style={styles.stripeNote}>Card payments handled securely by Stripe</Text>
          </Row>
        ) : null}
      </View>

      <Text style={[type.h1, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Activity</Text>

      {ledgerLoading && !ledger ? (
        <LoadingView label="Loading activity…" />
      ) : (ledger ?? []).length === 0 ? (
        <EmptyState title="No activity yet" hint="Top up your balance to start booking sessions." />
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {(ledger ?? []).map((entry, i) => (
            <LedgerRow key={entry.id} entry={entry} last={i === (ledger ?? []).length - 1} />
          ))}
        </Card>
      )}

      {USE_SUPABASE && !DEMO_AUTOLOGIN ? (
        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => void signOut()}
          style={{ marginTop: spacing.xl }}
        />
      ) : null}

      <TopUpSheet
        visible={topUpOpen}
        onConfirm={doTopUp}
        onClose={() => setTopUpOpen(false)}
      />
    </ScrollView>
  );
}

function LedgerRow({ entry, last }: { entry: LedgerEntry; last: boolean }) {
  const credit = entry.amountPence >= 0;
  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    entry.type === 'deposit' ? 'add' : entry.type === 'refund' ? 'arrow-undo' : 'tennisball';
  const chipBg = entry.type === 'deposit' ? colors.upSoft : entry.type === 'refund' ? colors.amberSoft : colors.trackBg;
  const chipFg = entry.type === 'deposit' ? colors.upText : entry.type === 'refund' ? colors.amberText : colors.textFaint;
  const sign = credit ? '+' : '−';
  const magnitude = Math.abs(entry.amountPence);

  return (
    <Row style={[styles.ledgerRow, !last && styles.ledgerDivider]} gap={spacing.md}>
      <View style={[styles.ledgerChip, { backgroundColor: chipBg }]}>
        <Ionicons name={icon} size={16} color={chipFg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyBold} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={type.caption}>{formatDate(entry.createdAt.slice(0, 10))}</Text>
      </View>
      <Text style={[styles.amount, { color: credit ? colors.upText : colors.text }]}>
        {sign}
        {formatMoney(magnitude)}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  balanceCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  balanceRule: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 4,
    backgroundColor: colors.coral,
  },
  balanceHint: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textOnDarkMuted,
    marginTop: 2,
  },
  stripeNote: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.textOnDarkMuted,
  },
  ledgerChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.coralBright,
  },
  balanceMoney: {
    fontFamily: fonts.monoBold,
    fontSize: 46,
    color: colors.textOnDark,
    marginTop: spacing.xs,
  },
  ledgerRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  ledgerDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  amount: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
  },
});
