import {
  CameraPlacement,
  SensorHealth,
  TamperState,
  type CabinSensor,
  type CabinRetentionPolicy,
} from '@aegisdrive/types';

/**
 * Sensor health, capability and retention policy.
 *
 * ## Why placement gates capability
 *
 * A driver-facing camera cannot count rear occupants. Treating its count as
 * authoritative would silently under-report the back seat, which is precisely
 * where unexpected occupants appear during a hijacking — the failure would be
 * invisible and would land in the one situation the product exists for.
 *
 * So capability is derived from placement rather than assumed, and a snapshot
 * records which positions no sensor could observe. "We counted two" and "we
 * counted two and could not see the back row" are different claims.
 */

export const SENSOR_POLICY_VERSION = 'cabin-sensor-v1' as const;

/** What each placement can legitimately be asked for. */
export const PLACEMENT_CAPABILITY: Readonly<
  Record<
    CameraPlacement,
    { pose: boolean; occupancy: boolean; objects: boolean; rearSeats: boolean }
  >
> = Object.freeze({
  [CameraPlacement.DRIVER_FACING]: {
    pose: true,
    // Deliberately false. A driver-facing lens sees one seat; letting it report
    // an occupant count would make "1" the answer in a vehicle carrying four.
    occupancy: false,
    objects: true,
    rearSeats: false,
  },
  [CameraPlacement.CABIN_WIDE]: {
    pose: true,
    occupancy: true,
    objects: true,
    rearSeats: true,
  },
  [CameraPlacement.REAR_CABIN]: {
    pose: true,
    occupancy: true,
    objects: true,
    rearSeats: true,
  },
  [CameraPlacement.CARGO]: {
    pose: false,
    // A cargo camera counting "occupants" would report boxes as people.
    occupancy: false,
    objects: true,
    rearSeats: false,
  },
});

/** Below this rolling quality, analysis is not attempted. */
export const MINIMUM_ANALYSIS_QUALITY = 0.35;

/** Seconds without a frame before a sensor is considered offline. */
export const FRAME_TIMEOUT_SECONDS = 30;

/**
 * Derives a sensor's health from what it is actually doing.
 *
 * Health is computed rather than reported by the device, because a device that
 * has been tampered with is exactly the device whose self-report cannot be
 * trusted. A covered camera will happily report itself healthy: it is powered,
 * its firmware is fine, and it is producing frames. They are just frames of
 * tape.
 */
export function deriveHealth(input: {
  lastFrameAt: string | null;
  meanQuality: number;
  tamper: TamperState;
  analysisEnabled: boolean;
  now?: Date;
}): SensorHealth {
  const now = input.now ?? new Date();

  if (input.tamper === TamperState.DISCONNECTED) return SensorHealth.OFFLINE;

  if (input.lastFrameAt === null) return SensorHealth.UNKNOWN;

  const ageSeconds = (now.getTime() - Date.parse(input.lastFrameAt)) / 1000;
  if (!Number.isFinite(ageSeconds)) return SensorHealth.UNKNOWN;
  if (ageSeconds > FRAME_TIMEOUT_SECONDS) return SensorHealth.OFFLINE;

  // Producing frames, but nothing usable is in them.
  if (
    input.tamper === TamperState.OBSTRUCTED ||
    input.tamper === TamperState.BLINDED ||
    input.tamper === TamperState.MISALIGNED
  ) {
    return SensorHealth.IMPAIRED;
  }

  if (input.meanQuality < MINIMUM_ANALYSIS_QUALITY) return SensorHealth.DEGRADED;

  return SensorHealth.HEALTHY;
}

/** Whether a sensor's output may be used for analysis at all. */
export function canAnalyse(
  sensor: Pick<CabinSensor, 'health' | 'analysisEnabled' | 'meanQuality'>,
): boolean {
  if (!sensor.analysisEnabled) return false;
  if (sensor.meanQuality < MINIMUM_ANALYSIS_QUALITY) return false;

  return sensor.health === SensorHealth.HEALTHY || sensor.health === SensorHealth.DEGRADED;
}

/**
 * Whether a sensor may be enrolled against a vehicle.
 *
 * The recording-indicator requirement is enforced here rather than left to
 * installation procedure. Workers under continuous camera observation must know
 * the camera is there, and an installation that skipped the indicator would
 * otherwise be discovered only during an audit — by which point months of
 * footage have been captured without notice.
 */
export function validateEnrolment(input: {
  recordingIndicatorFitted: boolean;
  serialNumber: string;
}): { valid: true } | { valid: false; reason: string } {
  if (!input.recordingIndicatorFitted) {
    return {
      valid: false,
      reason:
        'A cabin sensor cannot be enrolled without a fitted recording indicator. Continuous observation of workers requires visible notice, and an unmarked installation is a compliance failure rather than a configuration choice.',
    };
  }

  if (input.serialNumber.trim().length < 4) {
    return { valid: false, reason: 'A stable hardware serial is required for enrolment.' };
  }

  return { valid: true };
}

/**
 * The retention policy, as a constant rather than configuration.
 *
 * `retainMediaByDefault` is typed as the literal `false`, so enabling
 * continuous retention is a reviewable type change rather than a checkbox
 * somebody ticks during a pilot and nobody unticks afterwards.
 *
 * The pre-incident buffer is the interesting number. The minutes *before* an
 * incident are the ones an investigator needs and the ones that cannot be
 * recovered retrospectively, so a short rolling buffer is held in volatile
 * memory and committed to evidence only when an incident is opened. Sixty
 * seconds is long enough to capture an approach and short enough that the
 * buffer is not a de facto recording.
 */
export const CABIN_RETENTION: CabinRetentionPolicy = Object.freeze({
  retainMediaByDefault: false,
  preIncidentBufferSeconds: 60,
  incidentMediaSealed: true,
});

/**
 * Whether the recording indicator may change state.
 *
 * Always `false`, and the function exists so that any code reaching for the
 * indicator has to read why.
 *
 * The indicator must be **constantly illuminated whenever the device is
 * powered**, never driven by detection state. A light that changes when the
 * engine notices something tells an attacker the system has reacted, in front
 * of the driver it is protecting — the exact failure ADR-0008 decision 5 exists
 * to prevent. A constant light discloses everything the driver is owed and
 * nothing an attacker can use.
 */
export function mayIndicatorReflectDetectionState(): { permitted: false; reason: string } {
  return {
    permitted: false,
    reason:
      'The recording indicator must be constantly illuminated while the device is powered, never driven by detection state. A state change is observable from inside the cabin and would warn an attacker that the system has detected something, in front of the person it is protecting.',
  };
}

/** Positions no enrolled, analysable sensor can observe. */
export function unobservablePlacements(
  sensors: readonly Pick<CabinSensor, 'placement' | 'health' | 'analysisEnabled' | 'meanQuality'>[],
): { occupancy: boolean; rearSeats: boolean; pose: boolean } {
  const usable = sensors.filter(canAnalyse);

  const capable = usable.map((sensor) => PLACEMENT_CAPABILITY[sensor.placement]);

  return {
    occupancy: !capable.some((capability) => capability.occupancy),
    rearSeats: !capable.some((capability) => capability.rearSeats),
    pose: !capable.some((capability) => capability.pose),
  };
}
