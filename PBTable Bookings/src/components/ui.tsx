import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

// --- Card ----------------------------------------------------------------------
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// --- Buttons ---------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.coral },
    secondary: { backgroundColor: colors.navy },
    danger: { backgroundColor: colors.down },
    ghost: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.borderStrong },
  };
  const fg: Record<ButtonVariant, TextStyle> = {
    primary: { color: colors.textOnDark },
    secondary: { color: colors.textOnDark },
    danger: { color: colors.textOnDark },
    ghost: { color: colors.navy },
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        bg[variant],
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.navy : colors.textOnDark} />
      ) : (
        <Text style={[styles.buttonText, fg[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

// --- Badges / chips -----------------------------------------------------------------
export function Badge({
  label,
  tone = 'navy',
}: {
  label: string;
  tone?: 'navy' | 'coral' | 'green' | 'red' | 'amber' | 'grey';
}) {
  // Scoreboard badges: the two brand tones are SOLID (jersey colours);
  // signal tones stay tinted with AA-deep text.
  const tones = {
    navy: { bg: colors.navy, fg: colors.textOnDark },
    coral: { bg: colors.coral, fg: colors.navy },
    green: { bg: colors.upSoft, fg: colors.upText },
    red: { bg: colors.downSoft, fg: colors.downText },
    amber: { bg: colors.amberSoft, fg: colors.amberText },
    grey: { bg: colors.trackBg, fg: colors.textFaint },
  } as const;
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Selectable filter chip. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.navy, borderColor: colors.navy },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.chipText, selected && { color: colors.textOnDark }]}>{label}</Text>
    </Pressable>
  );
}

// --- States -----------------------------------------------------------------------
export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.coral} />
      <Text style={[type.caption, { marginTop: spacing.md }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.centered}>
      <Text style={[type.h2, { textAlign: 'center' }]}>{title}</Text>
      {hint ? (
        <Text style={[type.caption, { marginTop: spacing.sm, textAlign: 'center' }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <View style={styles.centered}>
      <Text style={[type.h2, { color: colors.downText }]}>Something went wrong</Text>
      <Text style={[type.caption, { marginTop: spacing.sm, textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}

// --- Capacity meter -------------------------------------------------------------------
/** Thin booked/capacity track — green with room, amber when nearly full, navy when full. */
export function CapacityBar({ booked, capacity }: { booked: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(1, booked / capacity) : 0;
  const fill = ratio >= 1 ? colors.navy : ratio >= 0.75 ? colors.amber : colors.up;
  return (
    <View style={styles.track}>
      <View style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: fill }]} />
    </View>
  );
}

// --- Layout helpers -------------------------------------------------------------------
export function Row({
  children,
  style,
  gap = spacing.sm,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md, marginTop: spacing.lg }}>
      <Text style={type.h1}>{title}</Text>
      {right}
    </Row>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.extrabold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    minHeight: 220,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.trackBg,
    overflow: 'hidden',
    flex: 1,
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
  },
});
