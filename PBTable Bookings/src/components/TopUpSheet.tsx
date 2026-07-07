import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Row } from '@/components/ui';
import { formatMoney, TOPUP_AMOUNTS } from '@/lib/money';
import { charge } from '@/services/payments';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

/**
 * MOCK top-up sheet — add money to the wallet with fake card fields (no
 * validation, always succeeds). This is the ONE place real money enters.
 * TODO: swap the charge for Stripe when the real backend lands.
 */
export function TopUpSheet({
  visible,
  minPence = 0,
  reason,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  /** Preselect the smallest preset that covers this (e.g. a booking shortfall). */
  minPence?: number;
  /** Optional context line, e.g. "You need £2 more to book Club Night Doubles". */
  reason?: string;
  onConfirm: (amountPence: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const defaultAmount = useMemo(
    () => TOPUP_AMOUNTS.find((a) => a >= minPence) ?? TOPUP_AMOUNTS[TOPUP_AMOUNTS.length - 1],
    [minPence]
  );
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [paying, setPaying] = useState(false);

  // Re-sync the default when the sheet is reopened for a different shortfall.
  const [lastMin, setLastMin] = useState(minPence);
  if (minPence !== lastMin) {
    setLastMin(minPence);
    setAmount(defaultAmount);
  }

  const pay = async () => {
    setPaying(true);
    await charge({ amountPence: amount, description: `Wallet top-up`, cardNumber, expiry, cvc });
    await onConfirm(amount);
    setPaying(false);
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
            {reason ?? 'Add money to your balance to book sessions.'}
          </Text>

          <Text style={styles.label}>Amount</Text>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            {TOPUP_AMOUNTS.map((a) => {
              const selected = a === amount;
              return (
                <Pressable
                  key={a}
                  onPress={() => setAmount(a)}
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
          </Row>

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

          <Button
            title={paying ? 'Adding money…' : `Pay ${formatMoney(amount)}`}
            onPress={pay}
            loading={paying}
            style={{ marginTop: spacing.lg }}
          />
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
