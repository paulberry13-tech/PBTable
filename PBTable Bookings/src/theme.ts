/**
 * PBTable brand tokens — the single place to tune the look.
 *
 * Design language borrowed from Timely (gettimely.com): warm off-white
 * canvas, blue-charcoal ink, deep indigo brand surfaces, soft lilac/pink
 * pastel chips, coral CTAs, serif display headlines, pill buttons and
 * generous card radii.
 *
 * Rule of thumb: the vibrant signal colours (coral/up/down/amber) are for
 * FILLS, ICONS and ARROWS; their *Text variants are darkened for WCAG-AA
 * contrast and are what small text on light surfaces should use.
 */
import { Platform, TextStyle } from 'react-native';

export const colors = {
  // Brand
  navy: '#353475',        // deep indigo — header, brand surfaces, key numbers
  navySoft: '#4F4DB0',    // mid indigo — active states, links, info banners
  lilac: '#E4E3F7',       // soft indigo tint — chips, section blocks
  lilacSoft: '#F0EFFC',
  pink: '#FFE4F7',        // signature pastel chip
  pinkDeep: '#7A264A',    // deep berry — text on pink
  coral: '#FF616A',       // accent — CTAs, highlights
  coralSoft: '#FFE7E3',
  coralText: '#C7333D',   // coral for small text on light surfaces
  // Surfaces
  background: '#F9F7F5',
  card: '#FFFFFF',
  border: '#EEEBE7',
  borderStrong: '#D2D3D3',
  // Signals
  up: '#569993',
  upSoft: '#E3F1F0',
  upText: '#005E4F',
  down: '#DE5159',
  downSoft: '#FBE7E5',
  downText: '#B12A32',
  amber: '#E8A13A',
  amberSoft: '#FBF1DF',
  amberText: '#96610A',
  // Text
  text: '#39464E',
  textMuted: '#525D64',
  textFaint: '#6C757A',
  textOnDark: '#FFFFFF',
  // Misc
  navyOverlay: 'rgba(38, 37, 84, 0.55)',
  trackBg: '#EDEAE6',
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
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/**
 * Type families. Fraunces (a soft chunky serif, cousin of Timely's Domaine
 * Display) carries screen titles; Manrope carries all other UI text;
 * JetBrains Mono is reserved for ratings, ranks and scores — the
 * scoreboard numbers that are the product's currency.
 */
export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
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
    fontSize: 28,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: 0,
  } as TextStyle,
  h1: {
    fontSize: 21,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: 0,
  } as TextStyle,
  h2: { fontSize: 16, fontFamily: fonts.bold, color: colors.text } as TextStyle,
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
    web: { boxShadow: '0 1px 2px rgba(57, 70, 78, 0.04), 0 6px 20px rgba(57, 70, 78, 0.06)' } as object,
    default: {
      shadowColor: '#39464E',
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  }) as object,
  raised: Platform.select({
    web: { boxShadow: '0 6px 12px rgba(57, 70, 78, 0.10), 0 18px 44px rgba(57, 70, 78, 0.16)' } as object,
    default: {
      shadowColor: '#39464E',
      shadowOpacity: 0.16,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
  }) as object,
} as const;
