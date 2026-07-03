import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Row } from '@/components/ui';
import { charge, formatPence } from '@/services/payments';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

/**
 * MOCK payment sheet — fake card fields, no validation, always succeeds.
 * TODO: swap for Stripe PaymentSheet when the real backend lands.
 */
export function PaymentSheet({
  visible,
  amountPence,
  description,
  onSuccess,
  onClose,
}: {
  visible: boolean;
  amountPence: number;
  description: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [name, setName] = useState('');
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    setPaying(true);
    await charge({ amountPence, description, cardNumber, expiry, cvc, nameOnCard: name });
    setPaying(false);
    onSuccess();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h1}>Payment</Text>
            <Pressable onPress={onClose} disabled={paying} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </Row>
          <Text style={[type.caption, { marginTop: 4 }]}>{description}</Text>

          <View style={styles.demoNote}>
            <Ionicons name="flask-outline" size={14} color={colors.amber} />
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
          <Text style={styles.label}>Name on card</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="A N Other"
            placeholderTextColor={colors.textFaint}
          />

          <Button
            title={paying ? 'Contacting your bank…' : `Pay ${formatPence(amountPence)}`}
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
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    ...shadow.raised,
  },
  demoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
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
    marginBottom: 4,
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
