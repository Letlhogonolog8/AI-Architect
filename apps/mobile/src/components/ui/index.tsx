import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/theme/tokens';

/**
 * Mobile UI kit.
 *
 * A deliberately small set of primitives sharing the palette in
 * `theme/tokens.ts`, which mirrors `packages/ui`. React Native cannot consume
 * the web design system's CSS custom properties, so this is a parallel
 * implementation of the same design language rather than a port.
 *
 * Everything here is built for one-handed use in a moving vehicle: minimum 48pt
 * touch targets, high contrast, and no control that depends on a precise gesture.
 */

// ============================================================================
// Layout
// ============================================================================

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.screenContent, style]}>{children}</View>;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  tone = 'default',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'alarm' | 'accent';
}) {
  return (
    <View
      style={[
        styles.card,
        tone === 'alarm' && styles.cardAlarm,
        tone === 'accent' && styles.cardAccent,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  gap = spacing.sm,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

// ============================================================================
// Typography
// ============================================================================

type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'warning';

const TONE_COLOUR: Record<TextTone, string> = {
  primary: colors.inkPrimary,
  secondary: colors.inkSecondary,
  tertiary: colors.inkTertiary,
  accent: colors.aegis400,
  danger: colors.critical,
  success: colors.success,
  warning: colors.warning,
};

export function Title({
  children,
  tone = 'primary',
  style,
}: {
  children: ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[typography.title, { color: TONE_COLOUR[tone] }, style]}>{children}</Text>;
}

export function Body({
  children,
  tone = 'secondary',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[typography.body, { color: TONE_COLOUR[tone] }, style]}
    >
      {children}
    </Text>
  );
}

export function Caption({
  children,
  tone = 'tertiary',
  style,
}: {
  children: ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[typography.caption, { color: TONE_COLOUR[tone] }, style]}>{children}</Text>;
}

export function Overline({
  children,
  tone = 'tertiary',
}: {
  children: ReactNode;
  tone?: TextTone;
}) {
  return (
    <Text style={[typography.overline, styles.overline, { color: TONE_COLOUR[tone] }]}>
      {children}
    </Text>
  );
}

/** Tabular figures, so live values do not jitter as digits change. */
export function Metric({
  children,
  tone = 'primary',
  style,
}: {
  children: ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.metric, { color: TONE_COLOUR[tone] }, style]}>{children}</Text>;
}

// ============================================================================
// Controls
// ============================================================================

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  block = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' ? styles.buttonLarge : styles.buttonMedium,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        block && styles.buttonBlock,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.inkPrimary} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonLabel,
              size === 'lg' && styles.buttonLabelLarge,
              variant === 'ghost' && { color: colors.inkSecondary },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  dot = false,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live';
  dot?: boolean;
}) {
  // Exhaustively keyed on the tone union so the lookup cannot be undefined —
  // `noUncheckedIndexedAccess` correctly rejects a `Record<string, …>` here.
  const palette: Record<NonNullable<typeof tone>, { bg: string; fg: string }> = {
    neutral: { bg: 'rgba(255,255,255,0.06)', fg: colors.inkSecondary },
    accent: { bg: 'rgba(46,139,255,0.14)', fg: colors.aegis400 },
    success: { bg: 'rgba(34,197,94,0.14)', fg: colors.success },
    warning: { bg: 'rgba(245,158,11,0.14)', fg: colors.warning },
    danger: { bg: 'rgba(255,59,92,0.16)', fg: colors.critical },
    live: { bg: 'rgba(55,225,245,0.14)', fg: colors.hologram },
  };

  const { bg, fg } = palette[tone];

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: fg }]} /> : null}
      <Text style={[styles.pillLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Label-over-value block used across the dashboard and vehicle screens. */
export function StatBlock({
  label,
  value,
  caption,
  tone = 'primary',
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: TextTone;
}) {
  return (
    <View style={styles.statBlock}>
      <Overline>{label}</Overline>
      <Metric tone={tone} style={styles.statValue}>
        {value}
      </Metric>
      {caption ? <Caption>{caption}</Caption> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Body tone="primary" style={styles.emptyTitle}>
        {title}
      </Body>
      {description ? <Caption style={styles.emptyDescription}>{description}</Caption> : null}
      {action}
    </View>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color={colors.aegis400} />
      <Caption>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.void,
  },
  screenContent: {
    flex: 1,
    gap: spacing.md,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardAlarm: {
    borderColor: 'rgba(255,59,92,0.45)',
    backgroundColor: 'rgba(255,59,92,0.07)',
  },
  cardAccent: {
    borderColor: 'rgba(46,139,255,0.35)',
    backgroundColor: 'rgba(46,139,255,0.07)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: spacing.sm,
  },
  overline: {
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metric: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  // 48pt minimum: this app is used one-handed in a moving vehicle.
  buttonMedium: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  buttonLarge: {
    minHeight: 60,
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.aegis500,
    borderColor: colors.aegis400,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: colors.critical,
    borderColor: colors.critical,
  },
  buttonBlock: {
    alignSelf: 'stretch',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: colors.inkPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonLabelLarge: {
    fontSize: 17,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  statBlock: {
    gap: 2,
    flex: 1,
  },
  statValue: {
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontWeight: '600',
  },
  emptyDescription: {
    textAlign: 'center',
    maxWidth: 280,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
});
