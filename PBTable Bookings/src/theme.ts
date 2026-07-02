/**
 * PBTable brand tokens — the single place to tune the look.
 * Colours are approximate placeholders; swap freely.
 */
import { Platform, TextStyle } from 'react-native';

export const colors = {
  // Brand
  navy: '#0B2545',        // primary — headings, key numbers
  navySoft: '#274B77',
  coral: '#F4703A',       // accent — CTAs, badges, highlights
  coralSoft: '#FDEAE1',
  // Surfaces
  background: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E4E9F0',
  // Signals
  up: '#2FBF71',
  upSoft: '#E2F7EC',
  down: '#E5544B',
  downSoft: '#FBE7E5',
  amber: '#E8A13A',
  amberSoft: '#FBF1DF',
  // Text
  text: '#0B2545',
  textMuted: '#5C6B80',
  textFaint: '#8B98AA',
  textOnDark: '#FFFFFF',
  // Misc
  navyOverlay: 'rgba(11, 37, 69, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** Monospace family for ratings / leaderboard numbers. */
export const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace",
});

export const type = {
  display: { fontSize: 28, fontWeight: '800' as const, color: colors.navy, letterSpacing: -0.5 },
  h1: { fontSize: 22, fontWeight: '800' as const, color: colors.navy, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: '700' as const, color: colors.navy },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
  tiny: { fontSize: 11, fontWeight: '600' as const, color: colors.textFaint },
  mono: { fontFamily: monoFont, fontVariant: ['tabular-nums'] } as TextStyle,
} as const;

export const shadow = {
  card: Platform.select({
    web: { boxShadow: '0 2px 10px rgba(11, 37, 69, 0.07)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }) as object,
  raised: Platform.select({
    web: { boxShadow: '0 6px 22px rgba(11, 37, 69, 0.14)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  }) as object,
} as const;
