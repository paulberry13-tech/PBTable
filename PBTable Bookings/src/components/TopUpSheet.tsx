import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Row } from '@/components/ui';
import { formatMoney, TOPUP_AMOUNTS } from '@/lib/money';
import { DEMO_TOPUP, STRIPE_TOPUP } from '@/services/config';
import { charge } from '@/services/payments';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

/**
 * Top-up sheet. In Stripe mode the member picks an amount and continues to a
 * real (test-mode) Stripe Checkout page. Otherwise it collects fake card fields
 * (demo/mock — no real charge).
 */
export function TopUpSheet({
  visible,
  minPence = 0,
  reason,
  onConfirm,
  onClose,
  canPay,
}: {
  visible: boolean;
  /** Preselect the smallest preset that covers this (e.g. a booking shortfall). */
  minPence?: number;
  /** Optional context line, e.g. "You need £2 more to book Club Night Doubles". */
  reason?: string;
  onConfirm: (amountPence: number) => Promise<void> | void;
  onClose: () => void;
  /** Whether THIS club can take a card payment, asked of the database. Undefined
   *  in mock mode, where the demo path applies instead. */
  canPay?: boolean | null;
}) {
  const defaultAmount = useMemo(
    () => TOPUP_AMOUNTS.find((a) => a >= minPence) ?? TOPUP_AMOUNTS[TOPUP_AMOUNTS.length - 1],
    [minPence]
  );
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [customActive, setCustomActive] = useState(false);
  const [customText, setCustomText] = useState('');
  const customPence = Math.round((parseFloat(customText.replace(/[^0-9.]/g, '')) || 0) * 100);
  const effectiveAmount = customActive ? customPence : amount;
  const minAllowed = Math.max(100, minPence);
  const amountValid = effectiveAmount >= minAllowed;
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [paying, setPaying] = useState(false);
  // Shown in the sheet rather than behind it. pay() had a try/finally and no catch,
  // so every failure -- a declined demo card, an undeployed function, a club not set
  // up for payments -- ended as an unhandled rejection: the spinner stopped and
  // nothing else happened.
  const [payError, setPayError] = useState<string | null>(null);

  // A Stripe-hosted payment is right whenever THIS club can take one, or when the
  // demo build is pointed at the platform test account. The old code asked only
  // the second question, which is exactly why a club site fell through to the
  // fake card form.
  const stripePath = canPay === true || STRIPE_TOPUP;

  // "Not yet answered" is not the same as "no". canPay is null while the question is
  // in flight, and treating that as a refusal put "this club isn't taking card
  // payments" in front of a member whose club plainly does -- the worst possible
  // moment to be wrong, and it would have flickered away a beat later. The Wallet
  // never showed it because it only opens this sheet once the answer is in; the
  // session screen can open it sooner.
  const answered = canPay === true || canPay === false;
  const asking = !answered && !STRIPE_TOPUP && !DEMO_TOPUP;

  // Re-sync the default when the sheet is reopened for a different shortfall.
  const [lastMin, setLastMin] = useState(minPence);
  if (minPence !== lastMin) {
    setLastMin(minPence);
    setAmount(defaultAmount);
  }

  const pay = async () => {
    if (!amountValid) return;
    setPaying(true);
    setPayError(null);
    try {
      if (!stripePath) {
        await charge({ amountPence: effectiveAmount, description: `Wallet top-up`, cardNumber, expiry, cvc });
      }
      // In Stripe mode onConfirm → topUp redirects to Stripe Checkout.
      await onConfirm(effectiveAmount);
    } catch (e) {
      setPayError((e as Error)?.message ?? 'That did not go through. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h1}>Top up wallet</Text>
            <Pressable onPress={onClose} disabled={paying} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </Row>
          <Text style={[type.caption, { marginTop: 4 }]}>
            {reason ??
              (stripePath
                ? 'Add money to your balance — you’ll pay securely with Stripe.'
                : 'Add money to your balance to book sessions.')}
          </Text>

          <Text style={styles.label}>Amount</Text>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            {TOPUP_AMOUNTS.map((a) => {
              const selected = !customActive && a === amount;
              return (
                <Pressable
                  key={a}
                  onPress={() => {
                    setAmount(a);
                    setCustomActive(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.amountChip, selected && styles.amountChipSelected]}
                >
                  <Text style={[styles.amountText, selected && { color: colors.textOnDark }]}>
                    {formatMoney(a)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCustomActive(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: customActive }}
              style={[styles.amountChip, customActive && styles.amountChipSelected]}
            >
              <Text style={[styles.amountText, styles.customText, customActive && { color: colors.textOnDark }]}>
                Custom
              </Text>
            </Pressable>
          </Row>
          {customActive ? (
            <>
              <View style={styles.customInputWrap}>
                <Text style={styles.pound}>£</Text>
                <TextInput
                  style={styles.customInput}
                  value={customText}
                  onChangeText={(t) => setCustomText(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={colors.textFaint}
                  autoFocus
                />
              </View>
              {customText !== '' && !amountValid ? (
                <Text style={styles.minNote}>Minimum {formatMoney(minAllowed)}.</Text>
              ) : null}
            </>
          ) : null}

          {DEMO_TOPUP ? (
            <>
              <View style={styles.demoNote}>
                <Ionicons name="flask-outline" size={14} color={colors.amberText} />
                <Text style={styles.demoNoteText}>Demo payment — no card is charged</Text>
              </View>

              <Text style={styles.label}>Card number</Text>
              <TextInput
                style={styles.input}
                value={cardNumber}
                onChangeText={setCardNumber}
                keyboardType="number-pad"
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={colors.textFaint}
              />
              <Row gap={spacing.md}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Expiry</Text>
                  <TextInput
                    style={styles.input}
                    value={expiry}
                    onChangeText={setExpiry}
                    placeholder="MM/YY"
                    placeholderTextColor={colors.textFaint}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>CVC</Text>
                  <TextInput
                    style={styles.input}
                    value={cvc}
                    onChangeText={setCvc}
                    keyboardType="number-pad"
                    placeholder="123"
                    placeholderTextColor={colors.textFaint}
                  />
                </View>
              </Row>
            </>
          ) : null}

              {/* Neither path available: this club has no way to take a payment yet.
                  Say so plainly rather than offering a button that cannot work — that
                  is exactly how a member ends up typing a card number into nothing. */}
              {asking ? (
                <Text style={[type.caption, { marginTop: spacing.lg }]}>
                  Checking how this club takes payment…
                </Text>
              ) : !stripePath && !DEMO_TOPUP ? (
                <Text style={[type.caption, { marginTop: spacing.lg }]}>
                  This club isn&rsquo;t taking card payments yet. Speak to the club about paying for
                  sessions — booking still works in the meantime.
                </Text>
              ) : (
            <>
              {payError ? (
                <Text style={[type.caption, { color: colors.downText, marginTop: spacing.lg }]}>{payError}</Text>
              ) : null}
              <Button
              title={
                paying
                  ? stripePath
                    ? 'Opening Stripe…'
                    : 'Adding money…'
                  : stripePath
                    ? `Continue to payment · ${formatMoney(effectiveAmount)}`
                    : `Pay ${formatMoney(effectiveAmount)}`
              }
                onPress={pay}
                loading={paying}
                disabled={!amountValid}
                style={{ marginTop: spacing.lg }}
              />
            </>
              )}
          {stripePath ? (
            <Row style={{ marginTop: spacing.md, justifyContent: 'center' }} gap={6}>
              <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
              <Text style={[type.caption, { color: colors.textFaint }]}>
                You’ll pay on Stripe’s secure page, then come straight back.
              </Text>
            </Row>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.navyOverlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
    ...shadow.raised,
  },
  amountChip: {
    flex: 1,
    minWidth: 72,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  amountChipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  amountText: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.navy,
  },
  customText: {
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  pound: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.textMuted,
    marginRight: 4,
  },
  customInput: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 18,
    fontFamily: fonts.monoBold,
    color: colors.text,
  },
  minNote: {
    marginTop: 6,
    color: colors.amberText,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  demoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  demoNoteText: {
    color: colors.amberText,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  label: {
    ...type.tiny,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.card,
  },
});
