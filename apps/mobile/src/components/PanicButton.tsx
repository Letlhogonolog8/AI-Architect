import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { PanicMode, PanicTrigger } from '@/services/panic';
import { useSosStore } from '@/stores/sos.store';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * The panic control.
 *
 * Design constraints, all of which come from the fact that this is pressed by
 * someone in a vehicle being taken from them:
 *
 *   - **Large and always in the same place.** It is the only control on the
 *     dashboard that must be findable without looking.
 *   - **Hold, not tap.** A tap in a pocket is a false dispatch of armed
 *     responders. Holding for a moment is deliberate but still fast.
 *   - **The countdown is cancellable and obvious.** Ten seconds to undo a
 *     mistake, with the remaining time stated in words as well as by the ring.
 *   - **Once active, it does not offer a one-tap cancel.** Standing down is a
 *     separate, deliberate action on the incident screen — an attacker who
 *     grabs the phone should not be able to silence it with one press.
 */
export function PanicButton() {
  const phase = useSosStore((state) => state.phase);
  const remainingMs = useSosStore((state) => state.remainingMs);
  const arm = useSosStore((state) => state.arm);
  const disarm = useSosStore((state) => state.disarm);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'active') {
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [phase, pulse]);

  if (phase === 'active') {
    return (
      <View style={[styles.container, styles.containerActive]}>
        <Animated.View
          style={[
            styles.activeHalo,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              ],
            },
          ]}
        />
        <View style={styles.activeCore}>
          <Text style={styles.activeTitle}>ALARM ACTIVE</Text>
          <Text style={styles.activeSubtitle}>Control room notified · stay on this screen</Text>
        </View>
      </View>
    );
  }

  if (phase === 'arming') {
    const seconds = Math.ceil(remainingMs / 1000);

    return (
      <Pressable
        onPress={disarm}
        accessibilityRole="button"
        accessibilityLabel={`Panic activating in ${seconds} seconds. Tap to cancel.`}
        style={({ pressed }) => [
          styles.container,
          styles.containerArming,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.armingCount}>{seconds}</Text>
        <Text style={styles.armingTitle}>Sending alarm</Text>
        <Text style={styles.armingSubtitle}>Tap anywhere to cancel</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      // Long press rather than press: a tap in a pocket must not dispatch
      // armed responders. 600ms is deliberate without feeling slow.
      delayLongPress={600}
      onLongPress={() => arm(PanicTrigger.BUTTON, PanicMode.SILENT)}
      accessibilityRole="button"
      accessibilityLabel="Silent SOS. Press and hold to raise a silent alarm."
      accessibilityHint="Holds for a moment, then gives you ten seconds to cancel."
      style={({ pressed }) => [styles.container, styles.containerIdle, pressed && styles.pressed]}
    >
      <Text style={styles.idleTitle}>SILENT SOS</Text>
      <Text style={styles.idleSubtitle}>Press and hold</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 148,
    borderRadius: radii.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  containerIdle: {
    backgroundColor: 'rgba(255,59,92,0.10)',
    borderColor: 'rgba(255,59,92,0.45)',
  },
  containerArming: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderColor: colors.warning,
  },
  containerActive: {
    backgroundColor: colors.critical,
    borderColor: colors.critical,
  },
  pressed: {
    opacity: 0.85,
  },
  idleTitle: {
    color: colors.critical,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  idleSubtitle: {
    color: colors.inkTertiary,
    fontSize: 13,
  },
  armingCount: {
    color: colors.warning,
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  armingTitle: {
    color: colors.inkPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  armingSubtitle: {
    color: colors.inkSecondary,
    fontSize: 13,
  },
  activeHalo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  activeCore: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  activeTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  activeSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    textAlign: 'center',
  },
});
