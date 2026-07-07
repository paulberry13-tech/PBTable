import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Row } from '@/components/ui';
import { CREDIT_PENCE, formatMoney, penceFromCredits, TOPUP_BUNDLES } from '@/lib/credits';
import { charge } from '@/services/payments';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

/**
 * MOCK top-up sheet — buy credits in whole-number bundles with fake card
 * fields (no validation, always succeeds). 1 credit = £2.
 * TODO: swap the charge for Stripe when the real backend lands.
 */
export function TopUpSheet({
  visible,
  minCredits = 0,
  reason,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  /** Preselect the smallest bundle that covers this many credits (e.g. a booking shortfall). */
  minCredits?: number;
  /** Optional context line, e.g. "You need 3 credits to book Club Night Doubles". */
  reason?: string;
  onConfirm: (amountPence: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const defaultCredits = useMemo(
    () => TOPUP_BUNDLES.find((c) => c >= minCredits) ?? TOPUP_BUNDLES[TOPUP_BUNDLES.length - 1],
    [minCredits]
  );
  const [credits, setCredits] = useState<number>(defaultCredits);
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [paying, setPaying] = useState(false);

  // Re-sync the default when the sheet is reopened for a different shortfall.
  const [lastMin, setLastMin] = useState(minCredits);
  if (minCredits !== lastMin) {
    setLastMin(minCredits);
    setCredits(defaultCredits);
  }

  const amountPence = penceFromCredits(credits);

  const pay = async () => {
    setPaying(true);
    await charge({ amountPence, description: `Top-up · ${credits} credits`, cardNumber, expiry, cvc });
    await onConfirm(amountPence);
    setPaying(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h1}>Top up credits</Text>
            <Pressable onPress={onClose} disabled={paying} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </Row>
          <Text style={[type.caption, { marginTop: 4 }]}>
            {reason ?? `1 credit = ${formatMoney(CREDIT_PENCE)}. Credits pay for your bookings.`}
          </Text>

          <Text style={styles.label}>Choose a bundle</Text>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            {TOPUP_BUNDLES.map((c) => {
              const selected = c === credits;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCredits(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.bundle, selected && styles.bundleSelected]}
                >
                  <Text style={[styles.bundleCredits, selected && { color: colors.textOnDark }]}>
                    {c}
                  </Text>
                  <Text style={[styles.bundleUnit, selected && { color: colors.textOnDark }]}>
                    credits
                  </Text>
                  <Text style={[styles.bundlePrice, selected && { color: colors.textOnDark }]}>
                    {formatMoney(penceFromCredits(c))}
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
            title={paying ? 'Adding credits…' : `Pay ${formatMoney(amountPence)} · ${credits} credits`}
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
  bundle: {
    flex: 1,
    minWidth: 72,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  bundleSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  bundleCredits: {
    fontFamily: fonts.monoBold,
    fontSize: 22,
    color: colors.navy,
  },
  bundleUnit: {
    ...type.tiny,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
  bundlePrice: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
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
