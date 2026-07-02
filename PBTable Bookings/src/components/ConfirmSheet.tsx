import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button, Row } from '@/components/ui';
import { colors, radius, shadow, spacing, type } from '@/theme';

/** Cross-platform confirm dialog (Alert.alert is a no-op on web). */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={type.h1}>{title}</Text>
          <Text style={[type.body, { marginTop: spacing.md, lineHeight: 21 }]}>{message}</Text>
          <Row gap={spacing.md} style={{ marginTop: spacing.xl }}>
            <Button title="Keep it" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={busy}
              style={{ flex: 1 }}
            />
          </Row>
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
});
