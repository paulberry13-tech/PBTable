import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopUpSheet } from '@/components/TopUpSheet';
import { Button, Card, EmptyState, LoadingView, Row } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { DEMO_AUTOLOGIN, DEMO_TOPUP, STRIPE_TOPUP, USE_SUPABASE } from '@/services/config';
import { clubTakesPayments } from '@/services/data';
import * as data from '@/services/data';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { LedgerEntry } from '@/types';

export default function WalletScreen() {
  const { currentUser, refresh, showBanner, signOut } = useApp();
  const [topUpOpen, setTopUpOpen] = useState(false);
  // Whether THIS club can take a payment, asked of the database rather than
  // inferred from which bundle this is. null while we are still asking, so the
  // button does not flicker in and then out.
  const [canPay, setCanPay] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    clubTakesPayments().then((v) => alive && setCanPay(v));
    return () => { alive = false; };
  }, []);

  // Reconcile this member's card top-ups against Stripe whenever the wallet opens.
  //
  // The webhook (connect-topup-webhook) is supposed to do this and still runs. It is
  // not trusted to be the only path: on 25 Aug 2026 a real payment on a real
  // connected account produced no delivery to any destination that could be
  // configured, and the member was left looking at a zero balance after paying.
  //
  // Two things happen in one call:
  //   * if we hold a reference from the Stripe return trip, that payment is settled
  //     precisely;
  //   * either way the server sweeps -- anything this member has actually paid for
  //     that the ledger is missing gets credited. That is what covers a cleared
  //     browser, a different device, or a tab closed before it settled.
  //
  // The reference is read once and stashed BEFORE anything else, because returning
  // from Stripe is a full page load: the sign-in is restored asynchronously, so a
  // call made on mount goes out with no token and is rightly refused. The first
  // build of this did exactly that and logged two 401s against a payment that had
  // succeeded.
  const PENDING_KEY = 'pb.pendingTopup';
  const [confirming, setConfirming] = useState(false);
  const [claim, setClaim] = useState<{ id: string | null } | null>(null);
  const [settled, setSettled] = useState(false);
  // A payment Stripe has taken but not yet settled. Without showing this, a member
  // on a slower payment method sees £0.00 and an invitation to pay again.
  const [awaitingStripe, setAwaitingStripe] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setClaim({ id: null }); // native still sweeps, it just has no return URL
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('topup') === 'success' ? params.get('session_id') : null;
    if (fromUrl) {
      // Stored first, then stripped from the URL -- so a refresh cannot replay it and
      // a copied link cannot carry a payment reference around.
      try { window.localStorage.setItem(PENDING_KEY, fromUrl); } catch {}
      window.history.replaceState({}, '', window.location.pathname);
    }
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(PENDING_KEY); } catch {}
    setClaim({ id: fromUrl ?? stored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!claim || !currentUser || settled) return;
    setSettled(true); // once per visit; the sweep is not worth repeating on a re-render
    // Only announce work the member is waiting on. A routine background sweep that
    // finds nothing should be invisible.
    if (claim.id) setConfirming(true);
    const forget = () => { try { window.localStorage.removeItem(PENDING_KEY); } catch {} };
    data
      .confirmTopUp(claim.id)
      .then((r) => {
        setAwaitingStripe(r.pending);
        // The claim is kept only while Stripe is still settling the payment.
        if (!r.pending) forget();
        if (r.creditedPence > 0) {
          showBanner(`${formatMoney(r.creditedPence)} added to your balance.`, 'success');
          refresh();
        } else if (r.reversed > 0) {
          // Silence here would read as the app losing a payment, when in fact the
          // money has gone back to the card.
          showBanner('A recent payment was refunded, so it has not been added to your balance.', 'info');
        } else if (r.truncated) {
          // The sweep measured this and used to discard it, which turned "we could
          // not check everything" into a confident "nothing found".
          showBanner('We could not check every recent payment. If a top-up is missing, please tell the club.', 'warning');
        }
      })
      .catch((e) => {
        // A 4xx other than 401 means this claim will NEVER succeed -- most often it
        // belongs to somebody who used this browser before. Holding on to it would
        // fail on every future visit and, because the named session is checked before
        // the sweep, would block the sweep for good on that device.
        if ((e as { terminal?: boolean })?.terminal) forget();
        // Otherwise kept on purpose: usually a token mid-refresh or a dropped
        // connection, and discarding it would strand money genuinely paid.
        //
        // Silent when there was nothing to settle. A member who simply opened their
        // wallet has not asked us anything and should not be shown an error.
        if (claim.id) showBanner(e?.message ?? 'Could not confirm your payment.', 'warning');
      })
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, currentUser, settled]);

  const { data: balance, loading: balLoading, error: balanceError } = useAsyncData(
    () => (currentUser ? data.getBalance(currentUser.id) : Promise.resolve(0)),
    [currentUser?.id]
  );
  const { data: ledger, loading: ledgerLoading, error: ledgerError } = useAsyncData(
    () => (currentUser ? data.getLedger(currentUser.id) : Promise.resolve([])),
    [currentUser?.id]
  );

  if ((balLoading && balance === null) || !currentUser) {
    return <LoadingView label="Loading your wallet…" />;
  }

  const pence = balance ?? 0;

  const doTopUp = async (amountPence: number) => {
    // Both Stripe paths navigate away to a hosted payment page. Announcing "added
    // to your balance" here would be a claim made before a card had been entered.
    // The real confirmation happens on the way back, in the effect above.
    const leavingForStripe = canPay === true || STRIPE_TOPUP;
    try {
      await data.topUp(currentUser.id, amountPence);
    } catch (e) {
      // Every failure of this path used to be swallowed whole: the sheet closed, the
      // balance did not move, and nothing was said.
      setTopUpOpen(false);
      showBanner((e as Error)?.message ?? 'Could not start the payment.', 'warning');
      return;
    }
    setTopUpOpen(false);
    if (leavingForStripe) return;
    refresh();
    showBanner(`${formatMoney(amountPence)} added to your balance.`, 'success');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.display}>Wallet</Text>

      <View style={styles.balanceCard}>
        <View style={styles.balanceRule} />
        <Text style={styles.balanceLabel}>BALANCE</Text>
        <Text style={styles.balanceMoney}>{balanceError && balance === null ? '£–' : formatMoney(pence)}</Text>
        <Text style={styles.balanceHint}>
          {balanceError && balance === null
            ? 'We couldn’t load your balance just now. Please try again in a moment.'
            : confirming
            ? 'Confirming your payment…'
            : awaitingStripe
              ? 'Your payment is still being confirmed by Stripe. This can take a few minutes.'
              : pence === 0
                ? 'Top up to book your first session.'
                : 'Sessions are paid from this balance.'}
        </Text>
            {/* No Top up button when the club has no way to take money. An unusable
                button reads as broken software rather than as a club that simply has
                not switched payments on. */}
            {canPay === true || STRIPE_TOPUP || DEMO_TOPUP ? (
          <Button
            title="Top up"
            onPress={() => setTopUpOpen(true)}
            style={{ marginTop: spacing.lg, alignSelf: 'flex-start', paddingHorizontal: spacing.xxl }}
          />
            ) : null}
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
      ) : ledgerError ? (
        /* A failed fetch is NOT an empty ledger. Showing "No activity yet" above a
           real balance tells a member their money has no history behind it. */
        <EmptyState
          title="Couldn't load your activity"
          hint="Your balance is correct. Pull down to try again."
        />
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
        canPay={canPay}
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
        {/* Which session the money was for. Without this every row read the same:
            a label and the date the money moved, which is not what anyone is
            looking for when they open a statement. Top-ups have no session, so
            they keep the transaction date on its own. */}
        <Text style={type.caption} numberOfLines={1}>
          {entry.sessionLabel ?? formatDate(entry.createdAt.slice(0, 10))}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.amount, { color: credit ? colors.upText : colors.text }]}>
          {sign}
          {formatMoney(magnitude)}
        </Text>
        {/* Running balance: the reason people open a statement at all. */}
        <Text style={styles.balanceAfter}>{formatMoney(entry.balanceAfterPence)}</Text>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  balanceAfter: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 1,
  },
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
