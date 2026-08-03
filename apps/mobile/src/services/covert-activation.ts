import { Accelerometer } from 'expo-sensors';

/**
 * Covert activation by shake pattern.
 *
 * A driver being hijacked cannot open an app and press a button. They can, with
 * a phone in a pocket or a hand at their side, shake it — so the gesture is the
 * covert channel with the widest device support and no special permission.
 *
 * The detector must satisfy two opposing constraints:
 *
 *   - **It must not fire by accident.** A false panic dispatches armed
 *     responders to someone driving over a pothole. Hence a deliberate
 *     multi-shake pattern within a short window, not a single jolt.
 *   - **It must fire under stress.** Someone terrified does not produce a clean
 *     gesture, so the per-shake threshold is generous and only the *pattern* is
 *     strict.
 *
 * Power-button triggers (the other common covert channel) are not implementable
 * in managed Expo — the OS reserves that event. `docs` records it as requiring
 * a native module in the dev build.
 */

/** Total acceleration magnitude, in g, that counts as a shake. 1g is gravity at rest. */
const SHAKE_THRESHOLD_G = 1.8;

/** Shakes needed to trigger. */
const REQUIRED_SHAKES = 4;

/** All shakes must land inside this window. */
const PATTERN_WINDOW_MS = 2_500;

/** Ignore samples this close to the previous accepted shake, so one jolt is not counted twice. */
const DEBOUNCE_MS = 180;

const SAMPLE_INTERVAL_MS = 100;

export interface CovertDetectorHandle {
  stop: () => void;
}

/**
 * Starts listening for the shake pattern.
 *
 * Returns a handle whose `stop()` must be called on unmount — the accelerometer
 * keeps the sensor hardware awake and is a measurable battery cost.
 */
export function startShakeDetector(onTrigger: () => void): CovertDetectorHandle {
  let timestamps: number[] = [];
  let lastAccepted = 0;

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

  const subscription = Accelerometer.addListener(({ x, y, z }) => {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (magnitude < SHAKE_THRESHOLD_G) return;

    const now = Date.now();
    if (now - lastAccepted < DEBOUNCE_MS) return;

    lastAccepted = now;

    // Keep only shakes inside the rolling window.
    timestamps = [...timestamps.filter((time) => now - time <= PATTERN_WINDOW_MS), now];

    if (timestamps.length >= REQUIRED_SHAKES) {
      timestamps = [];
      onTrigger();
    }
  });

  return {
    stop: () => subscription.remove(),
  };
}

/** Whether the device exposes an accelerometer at all. */
export async function isShakeDetectionAvailable(): Promise<boolean> {
  try {
    return await Accelerometer.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Tap-pattern activation.
 *
 * The secondary covert channel: a specific number of taps anywhere on an
 * innocuous-looking screen. Used by the decoy screen, so a driver whose phone
 * is being watched can raise an alarm while appearing to check the weather.
 */
export class TapPatternDetector {
  private taps: number[] = [];

  constructor(
    private readonly requiredTaps = 5,
    private readonly windowMs = 3_000,
  ) {}

  /** Records a tap. Returns true when the pattern completes. */
  register(): boolean {
    const now = Date.now();
    this.taps = [...this.taps.filter((time) => now - time <= this.windowMs), now];

    if (this.taps.length >= this.requiredTaps) {
      this.taps = [];
      return true;
    }

    return false;
  }

  reset(): void {
    this.taps = [];
  }

  /** Taps still needed. Never surfaced on the decoy screen — that would give it away. */
  get remaining(): number {
    return Math.max(0, this.requiredTaps - this.taps.length);
  }
}
