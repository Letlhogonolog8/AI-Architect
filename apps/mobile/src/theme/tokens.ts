/**
 * Design tokens, mirroring `packages/ui/src/styles/theme.css`.
 *
 * React Native cannot consume Tailwind's CSS custom properties, so the palette
 * is duplicated here as plain values. The duplication is real and is the reason
 * `docs/adr/0003-mobile-standalone.md` treats publishing the design tokens as a
 * package as the intended end state. Until then: **change both files together.**
 */
export const colors = {
  void: '#04060B',
  abyss: '#070A11',
  surface: '#0B101A',
  surfaceRaised: '#111827',

  inkPrimary: '#E8EEF7',
  inkSecondary: '#9AA8BD',
  inkTertiary: '#647186',

  aegis400: '#4FA3FF',
  aegis500: '#2E8BFF',
  aegis600: '#1B6FE0',
  hologram: '#37E1F5',

  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  critical: '#FF3B5C',
} as const;

export const severityColors = {
  INFO: '#64748B',
  LOW: '#38BDF8',
  MEDIUM: '#F59E0B',
  HIGH: '#FB7185',
  CRITICAL: '#FF3B5C',
} as const;

export const threatColors = {
  MINIMAL: '#22C55E',
  GUARDED: '#84CC16',
  ELEVATED: '#F59E0B',
  HIGH: '#FB7185',
  SEVERE: '#FF3B5C',
} as const;

/** 4pt grid, matching the web client's rhythm. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  control: 10,
  card: 16,
  panel: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 28, letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 16 },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5 },
} as const;
