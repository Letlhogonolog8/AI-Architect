import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bannerFor, useConnectivityStore } from '@/stores/connectivity.store';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Connectivity and delivery banner.
 *
 * Answers the question a driver actually has — "did that get through?" — rather
 * than the one a network library answers.
 *
 * `panic-pending` is the case this exists for. A driver who triggered an alarm
 * in a dead zone must know it has not yet reached anyone, because the decision
 * they make next depends on it. Showing a generic offline icon would let them
 * assume help is on the way.
 */
export function ConnectivityBanner() {
  const state = useConnectivityStore();
  const banner = bannerFor(state);
  const retryNow = useConnectivityStore((store) => store.retryNow);

  if (banner === 'none') return null;

  const content = {
    'panic-pending': {
      title: 'ALARM NOT YET DELIVERED',
      detail: `Retrying continuously${ageSuffix(state.oldestAgeMs)}. Move to open sky if you can.`,
      style: styles.panic,
      titleStyle: styles.panicTitle,
    },
    offline: {
      title: 'No connection',
      detail: `${state.pending} action${state.pending === 1 ? '' : 's'} queued. They will send automatically.`,
      style: styles.offline,
      titleStyle: styles.offlineTitle,
    },
    degraded: {
      title: 'Connection is degraded',
      detail: `Queued for ${ageLabel(state.oldestAgeMs)}. Tap to retry now.`,
      style: styles.degraded,
      titleStyle: styles.degradedTitle,
    },
  }[banner];

  return (
    <Pressable
      onPress={() => void retryNow()}
      accessibilityRole="button"
      accessibilityLabel={`${content.title}. ${content.detail}`}
      style={[styles.banner, content.style]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, content.titleStyle]}>{content.title}</Text>
        <Text style={styles.detail}>{content.detail}</Text>
      </View>
      {state.isDraining ? <Text style={styles.activity}>Sending…</Text> : null}
    </Pressable>
  );
}

function ageLabel(ms: number | null): string {
  if (ms === null) return 'a moment';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function ageSuffix(ms: number | null): string {
  return ms === null ? '' : ` — queued ${ageLabel(ms)} ago`;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  detail: {
    color: colors.inkSecondary,
    fontSize: 12,
  },
  activity: {
    color: colors.inkTertiary,
    fontSize: 11,
  },
  panic: {
    backgroundColor: 'rgba(255,59,92,0.16)',
    borderColor: colors.critical,
  },
  panicTitle: {
    color: colors.critical,
  },
  offline: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  offlineTitle: {
    color: colors.inkPrimary,
  },
  degraded: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderColor: 'rgba(245,158,11,0.45)',
  },
  degradedTitle: {
    color: colors.warning,
  },
});
