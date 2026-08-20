/**
 * PBTable brand tokens — the single place to tune the look.
 *
 * These MIRROR the dashboard's CSS variables in site/index.html (the
 * `bold-sporty` :root theme) so /app and the dashboard read as one product.
 * If a colour changes there, change it here too — the values below are the
 * hex equivalents of --coral, --navy, --green, --red, --amber, --text, etc.
 *
 * Design language: ATHLETIC SCOREBOARD. PBTable's navy + coral, dark chrome
 * top and bottom, Oswald uppercase display type, Inter for UI text, tabular
 * figures for ratings and scores. Sporty and sharp — never corporate.
 *
 * Rule of thumb: the vibrant signal colours (coral/up/down/amber) are for
 * FILLS, ICONS and ARROWS; their *Text variants are darkened for WCAG-AA
 * contrast and are what small text on light surfaces should use.
 */
import { Platform, TextStyle } from 'react-native';

export const colors = {
  // Brand — dashboard --navy / --coral / --coral-dark / --coral-fill
  navy: '#1B2B4B',        // primary — chrome, headings, key numbers
  navyDeep: '#0F1A2E',    // darker band for the podium / chrome gradients
  navySoft: '#33456B',
  coral: '#FF6B4A',       // accent — CTAs, highlights, live details
  coralBright: '#FF7A5C', // accent on dark surfaces
  coralSoft: '#FFF1EE',
  coralText: '#C2410C',   // coral for small text on light surfaces
  // Surfaces — dashboard --surface / --bg / --border / --scroll
  background: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  borderStrong: '#CBD5E1',
  // Signals — dashboard --green / --red / --amber, *Text from --conf-*
  up: '#10B981',
  upSoft: '#E7F8F2',
  upText: '#047857',
  down: '#EF4444',
  downSoft: '#FDECEC',
  downText: '#B91C1C',
  // Lifted variants for use on the navy chrome (dashboard's midnight --green/--red)
  upOnDark: '#34D399',
  downOnDark: '#F87171',
  amber: '#F59E0B',
  amberSoft: '#FEF5E7',
  amberText: '#B45309',
  // Text — dashboard --text / --text-soft / --text-muted
  text: '#111827',
  textMuted: '#374151',
  textFaint: '#64748B',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255,255,255,0.72)',
  // Misc
  navyOverlay: 'rgba(27, 43, 75, 0.60)',
  trackBg: '#F1F5F9',
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
  lg: 16,
  pill: 999,
} as const;

/**
 * Type families — the dashboard's pairing: Oswald (uppercase) carries screen
 * titles like a broadcast graphic, Inter carries UI text. The `mono` tokens
 * are Inter too: the dashboard has no monospace face, and `type.mono` already
 * sets tabular-nums, which is what keeps ratings and ranks column-aligned.
 */
export const fonts = {
  display: 'Oswald_600SemiBold',
  displayBold: 'Oswald_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  mono: 'Inter_500Medium',
  monoBold: 'Inter_700Bold',
} as const;

export const type = {
  display: {
    fontSize: 32,
    fontFamily: fonts.displayBold,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  } as TextStyle,
  h1: {
    fontSize: 24,
    fontFamily: fonts.displayBold,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
    web: { boxShadow: '0 1px 2px rgba(11, 37, 69, 0.05), 0 4px 14px rgba(11, 37, 69, 0.07)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
  }) as object,
  raised: Platform.select({
    web: { boxShadow: '0 6px 12px rgba(11, 37, 69, 0.10), 0 16px 40px rgba(11, 37, 69, 0.18)' } as object,
    default: {
      shadowColor: colors.navy,
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }) as object,
} as const;
