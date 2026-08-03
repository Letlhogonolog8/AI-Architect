import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { IncidentSeverity, IncidentType } from '@/types';
import { enqueue } from '@/db/outbox';
import { currentPosition, latestFrame } from './location';

/**
 * Panic activation.
 *
 * The most safety-critical path in the product. One rule governs everything
 * here: **a panic must never depend on connectivity to be recorded.**
 *
 * Sequence, in this order, deliberately:
 *
 *   1. Write to the durable outbox. Synchronous as far as the caller is
 *      concerned — this write *is* the activation.
 *   2. Give physical confirmation. A single haptic pulse, which a driver can
 *      feel with the phone in a pocket and an attacker beside them cannot see.
 *   3. Return. The sync engine delivers whenever there is signal, retrying
 *      across app restarts and reboots.
 *
 * The UI must not await the network before telling the driver it registered.
 * Anything else means a driver in a dead zone watches a spinner while believing
 * help is not coming.
 */

export const PanicMode = {
  /** No sound, no visible change beyond a subtle indicator. The default. */
  SILENT: 'SILENT',
  /** Siren and flashing screen. For deterrence when the driver is clear of the vehicle. */
  AUDIBLE: 'AUDIBLE',
} as const;
export type PanicMode = (typeof PanicMode)[keyof typeof PanicMode];

export const PanicTrigger = {
  BUTTON: 'BUTTON',
  /** Covert: rapid power-button presses or a shake pattern. */
  COVERT_GESTURE: 'COVERT_GESTURE',
  /** Covert: spoken duress phrase. */
  VOICE: 'VOICE',
  /** Paired smartwatch. */
  WATCH: 'WATCH',
  /** Driver failed to answer a mandatory check-in. */
  CHECK_IN_TIMEOUT: 'CHECK_IN_TIMEOUT',
} as const;
export type PanicTrigger = (typeof PanicTrigger)[keyof typeof PanicTrigger];

export interface PanicActivation {
  /** Client-generated so the record exists before the server has ever seen it. */
  id: string;
  activatedAt: string;
  mode: PanicMode;
  trigger: PanicTrigger;
  vehicleId: string | null;
  driverId: string | null;
  position: { longitude: number; latitude: number } | null;
}

/**
 * Grace period before a button-triggered panic commits.
 *
 * Ten seconds, and only for `BUTTON`. Long enough to undo a pocket press,
 * short enough to matter. Covert, voice and watch triggers have **no** grace
 * period: they are deliberate acts performed under duress, and a countdown the
 * driver must survive defeats the point.
 */
export const PANIC_GRACE_MS = 10_000;

export function requiresGracePeriod(trigger: PanicTrigger): boolean {
  return trigger === PanicTrigger.BUTTON;
}

/**
 * Commits a panic.
 *
 * Returns as soon as the activation is durable. Never throws for network
 * reasons — there is no network call on this path.
 */
export async function activatePanic(input: {
  mode: PanicMode;
  trigger: PanicTrigger;
  vehicleId: string | null;
  driverId: string | null;
}): Promise<PanicActivation> {
  const id = Crypto.randomUUID();
  const activatedAt = new Date().toISOString();

  // Best-effort position. A cached fix is used rather than waiting for a new
  // one: a GPS lock can take 30 seconds, and an activation with a
  // ninety-second-old position beats one that is still acquiring.
  const position = currentPosition();

  const activation: PanicActivation = {
    id,
    activatedAt,
    mode: input.mode,
    trigger: input.trigger,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    position: position ? { longitude: position.longitude, latitude: position.latitude } : null,
  };

  // Durable first. Everything after this point is best-effort.
  await enqueue(
    'PANIC_ACTIVATION',
    {
      type: IncidentType.PANIC_ACTIVATION,
      severity: IncidentSeverity.CRITICAL,
      title: `Panic activation — ${input.trigger.toLowerCase().replace(/_/g, ' ')}`,
      summary: buildSummary(activation),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      position: activation.position,
      detectedAt: activatedAt,
    },
    { id },
  );

  await confirmPhysically(input.mode);

  return activation;
}

/**
 * Physical confirmation.
 *
 * A driver being hijacked cannot look at their screen. One firm haptic pulse
 * tells them the activation registered; in silent mode there is nothing else —
 * no sound, no flash, no banner an attacker glancing over could notice.
 */
async function confirmPhysically(mode: PanicMode): Promise<void> {
  try {
    if (mode === PanicMode.SILENT) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    // Audible mode: a longer pattern, since discretion no longer applies.
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics are unavailable on some devices and in emulators. The activation
    // is already durable; failing to buzz must never fail the panic.
  }
}

function buildSummary(activation: PanicActivation): string {
  const parts = [
    `Driver panic activated via ${activation.trigger.toLowerCase().replace(/_/g, ' ')}.`,
    `Mode: ${activation.mode.toLowerCase()}.`,
  ];

  if (activation.position) {
    parts.push(
      `Last known position ${activation.position.latitude.toFixed(5)}, ${activation.position.longitude.toFixed(5)}.`,
    );
  } else {
    parts.push('No position fix was available at activation.');
  }

  const frame = latestFrame();
  if (frame?.speedKph !== null && frame?.speedKph !== undefined) {
    parts.push(`Speed at activation ${frame.speedKph.toFixed(0)} km/h.`);
  }

  return parts.join(' ');
}

/**
 * Cancels an activation that has not yet been delivered.
 *
 * Deliberately does **not** remove the outbox entry. Once a panic is raised the
 * control room owns it: the cancellation is queued as a follow-up note so the
 * operator sees both the activation and the retraction. A driver forced to
 * cancel under duress must not be able to erase the record.
 */
export async function cancelPanic(activationId: string, reason: string): Promise<void> {
  await enqueue('PANIC_CANCEL', {
    incidentId: activationId,
    reason: `Driver cancelled the activation: ${reason}`,
  });
}
