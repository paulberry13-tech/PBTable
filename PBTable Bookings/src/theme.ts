/**
 * PBTable brand tokens — the single place to tune the look.
 * Colours are approximate placeholders; swap freely.
 *
 * Rule of thumb: the vibrant signal colours (coral/up/down/amber) are for
 * FILLS, ICONS and ARROWS; their *Text variants are darkened for WCAG-AA
 * contrast and are what small text on light surfaces should use.
 */
import { Platform, TextStyle } from 'react-native';

export const colors = {
  // Brand
  navy: '#0B2545',        // primary — headings, key numbers
  navySoft: '#274B77',
  coral: '#E8571F',       // accent — CTAs, badges, highlights
  coralSoft: '#FDEAE1',
  coralText: '#BC4710',   // coral for small text on light surfaces
  // Surfaces
  background: '#F4F6F9',
  card: '#FFFFFF',
  border: '#E4E9F0',
  borderStrong: '#CBD5E1',
  // Signals
  up: '#2FBF71',
  upSoft: '#E2F7EC',
  upText: '#147A46',
  down: '#E5544B',
  downSoft: '#FBE7E5',
  downText: '#C03329',
  amber: '#E8A13A',
  amberSoft: '#FBF1DF',
  amberText: '#96610A',
  // Text
  text: '#0B2545',
  textMuted: '#51617A',
  textFaint: '#64748B',
  textOnDark: '#FFFFFF',
  // Misc
  navyOverlay: 'rgba(11, 37, 69, 0.55)',
  trackBg: '#EAEEF3',
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
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/**
 * Type families. Manrope carries all UI text (one family, weight-graded);
 * JetBrains Mono is reserved for ratings, ranks and scores — the
 * scoreboard numbers that are the product's currency.
 */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const type = {
  display: {
    fontSize: 26,
    fontFamily: fonts.extrabold,
    color: colors.navy,
    letterSpacing: -0.5,
  } as TextStyle,
  h1: {
    fontSize: 20,
    fontFamily: fonts.extrabold,
    color: colors.navy,
    letterSpacing: -0.3,
  } as TextStyle,
  h2: { fontSize: 16, fontFamily: fonts.bold, color: colors.navy } as TextStyle,
  body: { fontSize: 15, fontFamily: fonts.regular, color: colors.text, lineHeight: 21 } as TextStyle,
  bodyBold: { fontSize: 15, fontFamily: fonts.bold, color: colors.text, lineHeight: 21 } as TextStyle,
  caption: { fontSize: 13, fontFamily: fonts.medium, color: colors.textMuted, lineHeight: 18 } as TextStyle,
  captionBold: { fontSize: 13, fontFamily: fonts.bold, color: colors.textMuted, lineHeight: 18 } as TextStyle,
  tiny: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.textFaint,
    letterSpacing: 0.6,
  } as TextStyle,
  mono: { fontFamily: fonts.mono, fontVariant: ['tabular-nums'] } as TextStyle,
  monoBold: { fontFamily: fonts.monoBold, fontVariant: ['tabular-nums'] } as TextStyle,
} as const;

export const shadow = {
  card: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(11, 37, 69, 0.05), 0 4px 14px rgba(11, 37, 69, 0.06)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
  }) as object,
  raised: Platform.select({
    web: { boxShadow: '0 6px 12px rgba(11, 37, 69, 0.10), 0 14px 36px rgba(11, 37, 69, 0.16)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }) as object,
} as const;
