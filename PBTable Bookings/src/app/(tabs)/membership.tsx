// Membership — the member's own view of the club's annual subscription.
//
// Its own section rather than a card inside Wallet (Paul, 2026-09-23): the wallet is
// money you spend session by session, this is one payment a year that changes what
// every session costs. They are different enough to keep apart, and the buy path will
// be a redirect to Stripe's own checkout rather than anything that happens in here.
//
// A member can turn their own auto-renewal on or off (Paul, 2026-09-24) but cannot end
// a membership early: that stays a conversation with the club, because a refund is the
// club's money and the club's decision. See src/services/membership.ts.

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, LoadingView } from '@/components/ui';
import { formatDateLong } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import {
  getMembershipQuote,
  getMyMembership,
  graceDaysLeft,
  membershipStateLabel,
  setMembershipRenewal,
  type MembershipQuote,
  type MyMembership,
} from '@/services/membership';
import { useApp, useAsyncData } from '@/store/AppContext';
import { colors, fonts, radius, spacing, type } from '@/theme';

export default function MembershipScreen() {
  const { currentUser, refresh } = useApp();
  const { data, loading } = useAsyncData<{ quote: MembershipQuote | null; mine: MyMembership | null }>(
    async () => {
      const [quote, mine] = await Promise.all([getMembershipQuote(), getMyMembership()]);
      return { quote, mine };
    },
    [currentUser?.id],
  );
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  if (loading) return <LoadingView label="Loading your membership…" />;

  const quote = data?.quote ?? null;
  const mine = data?.mine ?? null;
  const state = membershipStateLabel(mine);
  const days = graceDaysLeft(mine);

  // The switch means the opposite of the membership's OWN flag: cancel_at_period_end
  // true is what the member experiences as "off". Toggling asks for the state they are
  // moving TO, which setMembershipRenewal takes as `renews`, so this is the one place
  // that translation happens rather than it living in two files.
  const toggleRenewal = async () => {
    if (!mine || renewBusy) return;
    const goingTo = !!mine.cancel_at_period_end; // currently off -> turning on, and vice versa
    setRenewBusy(true);
    setRenewError(null);
    const result = await setMembershipRenewal(mine.id, goingTo);
    setRenewBusy(false);
    if (!result.ok) {
      setRenewError(result.error);
      return;
    }
    refresh();
  };

  // The club does not sell memberships (or this build is older than the migrations).
  // The tab is normally hidden in that case; this is the belt to that braces.
  if (!quote || !quote.enabled) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Card>
          <Text style={styles.h1}>Membership</Text>
          <Text style={styles.body}>This club does not offer memberships.</Text>
        </Card>
      </ScrollView>
    );
  }

  const isMember = state.key === 'active' || state.key === 'cancelling' || state.key === 'failing';

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* What they have, if anything. */}
      <Card>
        <View style={styles.headRow}>
          <Text style={styles.h1}>Membership</Text>
          <View style={[styles.pill, { backgroundColor: pillBg(state.key) }]}>
            <Text style={[styles.pillText, { color: pillFg(state.key) }]}>{state.label}</Text>
          </View>
        </View>

        {isMember ? (
          <>
            <Text style={styles.body}>
              You pay <Text style={styles.strong}>member prices</Text> when you book.
            </Text>
            {mine?.current_period_end && state.key !== 'failing' && (
              <Text style={styles.meta}>
                {state.key === 'cancelling' ? 'Yours until ' : 'Renews on '}
                {formatDateLong(mine.current_period_end.slice(0, 10))}
              </Text>
            )}
            {state.key === 'failing' && (
              <View style={styles.warn}>
                <Ionicons name="alert-circle" size={16} color={colors.down} />
                <Text style={styles.warnText}>
                  Your last payment did not go through. You keep member prices for{' '}
                  {days === null ? 'a short while' : `${days} more day${days === 1 ? '' : 's'}`} while
                  your bank tries again. Check the card on file with your club if it keeps failing.
                </Text>
              </View>
            )}
            {mine?.plan_name && (
              <Text style={styles.meta}>
                {mine.plan_name}
                {mine.price_pennies != null ? ` · ${formatMoney(mine.price_pennies)} a year` : ''}
              </Text>
            )}
            {state.key !== 'failing' && (
              <View style={styles.renewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.renewLabel}>Renew automatically</Text>
                  <Text style={styles.meta}>
                    {state.key === 'cancelling'
                      ? 'Off. You keep member prices until it ends, then it stops.'
                      : "On. You'll be charged again when your year ends."}
                  </Text>
                </View>
                <Button
                  title={state.key === 'cancelling' ? 'Turn on' : 'Turn off'}
                  onPress={toggleRenewal}
                  disabled={renewBusy}
                  loading={renewBusy}
                  variant="secondary"
                />
              </View>
            )}
            {renewError && (
              <View style={styles.warn}>
                <Ionicons name="alert-circle" size={16} color={colors.down} />
                <Text style={styles.warnText}>{renewError}</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.body}>
            {state.key === 'ended'
              ? 'Your membership was ended by the club. You pay the standard price when you book.'
              : state.key === 'lapsed'
                ? 'Your membership has lapsed, so you pay the standard price when you book.'
                : 'You are not a member, so you pay the standard price when you book.'}
          </Text>
        )}
      </Card>

      {/* What it costs, for anyone who does not have one. */}
      {!isMember && quote.plan && (
        <Card>
          <Text style={styles.h2}>{quote.plan.name}</Text>
          <Text style={styles.price}>{formatMoney(quote.plan.price_pennies)}</Text>
          <Text style={styles.meta}>a year</Text>

          <Text style={[styles.body, { marginTop: spacing.md }]}>
            Being a member gets you <Text style={styles.strong}>member prices</Text> on every
            session. It does not book anything for you or include any sessions.
          </Text>

          {quote.billing_mode === 'calendar' ? (
            <Text style={styles.meta}>
              {quote.december_free
                ? `Join now and pay nothing until ${quote.renews_on ? formatDateLong(quote.renews_on) : '1 January'}.`
                : quote.pro_rata
                  ? `You pay for the rest of this year now, then the full price on ${quote.renews_on ? formatDateLong(quote.renews_on) : '1 January'}.`
                  : `You pay for the year, and it renews on ${quote.renews_on ? formatDateLong(quote.renews_on) : '1 January'}.`}
            </Text>
          ) : (
            <Text style={styles.meta}>
              Your year starts today and renews on{' '}
              {quote.renews_on ? formatDateLong(quote.renews_on) : 'the same date next year'}.
            </Text>
          )}

          {/* Joining is a Stripe transaction and is not built yet. Say so plainly rather
              than showing a button that fails, or hiding the price a club has set. */}
          <Button title="Joining opens soon" onPress={() => {}} disabled />
          <Text style={styles.small}>
            When it opens you will pay through Stripe, on their own secure page. Your card
            details never reach this app.
          </Text>
        </Card>
      )}

      {/* The one thing they still cannot do here, said before they go looking for it.
          Turning renewal off is the button above — this is only about ending early. */}
      {isMember && (
        <Card>
          <Text style={styles.h2}>Ending your membership early</Text>
          <Text style={styles.body}>
            Speak to your club. They can end it for you straight away and agree any
            refund directly — that part still isn't done from the app.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

function pillBg(k: string) {
  if (k === 'active') return colors.upSoft;
  if (k === 'failing') return colors.downSoft;
  if (k === 'cancelling') return colors.amberSoft;
  return colors.border;
}
function pillFg(k: string) {
  if (k === 'active') return colors.upText;
  if (k === 'failing') return colors.downText;
  if (k === 'cancelling') return colors.amberText;
  return colors.textMuted;
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  h1: { ...type.h1, color: colors.navy },
  h2: { ...type.h2, color: colors.navy, marginBottom: spacing.xs },
  body: { ...type.body, color: colors.text, marginTop: spacing.xs },
  strong: { fontFamily: fonts.bold },
  meta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  renewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  renewLabel: { ...type.body, fontFamily: fonts.bold, color: colors.text },
  small: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  price: { fontFamily: fonts.mono, fontSize: 30, color: colors.navy, marginTop: spacing.xs },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { ...type.caption, fontFamily: fonts.bold },
  warn: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.downSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  warnText: { ...type.caption, color: colors.downText, flex: 1 },
});
