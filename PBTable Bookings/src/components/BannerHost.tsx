import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/store/AppContext';
import { colors, radius, shadow, spacing } from '@/theme';

/** In-app banners — the POC stand-in for push notifications. */
export function BannerHost() {
  const { banners, dismissBanner } = useApp();
  if (banners.length === 0) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {banners.map((b) => {
        const bg =
          b.tone === 'success' ? colors.up : b.tone === 'warning' ? colors.amber : colors.navySoft;
        return (
          <Pressable key={b.id} onPress={() => dismissBanner(b.id)} style={[styles.banner, { backgroundColor: bg }]}>
            <Text style={styles.text}>{b.message}</Text>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        );
      })}
    </View>
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
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.raised,
  },
  text: {
    color: colors.textOnDark,
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
    marginRight: spacing.md,
  },
  close: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },
});
