import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner, useApp } from '@/store/AppContext';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

/** In-app banners — the POC stand-in for push notifications. */
export function BannerHost() {
  const { banners, dismissBanner } = useApp();
  if (banners.length === 0) return null;

  return (
    <View style={[styles.host, { pointerEvents: 'box-none' }]}>
      {banners.map((b) => (
        <AnimatedBanner key={b.id} banner={b} onDismiss={() => dismissBanner(b.id)} />
      ))}
    </View>
  );
}

function AnimatedBanner({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
  }, []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  const bg =
    banner.tone === 'success' ? colors.up : banner.tone === 'warning' ? colors.amber : colors.navySoft;

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        style={[styles.banner, { backgroundColor: bg }]}
      >
        <Text style={styles.text}>{banner.message}</Text>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
    gap: spacing.sm,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 560,
    width: '100%',
    ...shadow.raised,
  },
  text: {
    color: colors.textOnDark,
    fontFamily: fonts.bold,
    fontSize: 14,
    flex: 1,
    marginRight: spacing.md,
  },
  close: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bold,
    fontSize: 13,
  },
});
