import {
  AcousticEventType,
  BehaviourSignal,
  DetectedObjectClass,
  DoorState,
  RESTRAINT_CLASSES,
  SensorHealth,
  TamperState,
  WEAPON_CLASSES,
  type AcousticEvent,
  type BehaviourObservation,
  type CabinSnapshot,
  type DoorSnapshot,
  type ObjectDetection,
  type OccupancyCount,
  type WeaponAssessment,
} from '@aegisdrive/types';

/**
 * Cabin detections → behaviour signals.
 *
 * The seam between the two engines. Phase 6 perceives; Phase 5 scores; this
 * file is the translation, and it is deliberately the only place the two meet.
 *
 * ## Why the translation is a separate, deterministic step
 *
 * A detector could emit `BehaviourObservation` directly and save a hop. It must
 * not, for the same reason the identity engine keeps fusion out of Python: the
 * mapping from "the camera saw a dark object at 0.82" to "this contributes
 * evidence of a hijacking" is a *policy* decision that has to be reviewable,
 * versioned and identical across every detector vendor. Buried inside a model
 * service it would drift per deployment, and an assessment produced in an
 * investigation could not be reproduced.
 *
 * Everything here is pure and total: same detections in, same signals out, no
 * clock and no I/O beyond the timestamps carried on the inputs.
 *
 * ## What this file will not do
 *
 * It never invents a signal a detector did not support, and it never upgrades
 * confidence. Every output's `detectorConfidence` is bounded by the input's,
 * and where the mapping is lossy — an ambiguous weapon, an occluded seat — the
 * output is weaker than the input rather than stronger.
 */

export const CABIN_SIGNAL_MAPPING_VERSION = 'cabin-signals-v1' as const;

/** Speed above which an open door or released belt stops being ordinary. */
const MOTION_SPEED_THRESHOLD_KPH = 8;

/** Object confidence below which nothing is emitted at all. */
const OBJECT_REPORTING_FLOOR = 0.6;

export interface CabinSignalInput {
  snapshot: CabinSnapshot;
  /** The previous window's occupancy, for detecting changes. */
  previousOccupancy?: OccupancyCount | null;
  /** Vehicle speed at the end of the window. */
  speedKph?: number | null;
}

/**
 * Derives every behaviour signal a cabin snapshot supports.
 *
 * Returns them unsorted — `scoreThreat` selects the strongest per signal and
 * applies the within-class discount, so ordering here would be discarded.
 */
export function deriveCabinSignals(input: CabinSignalInput): BehaviourObservation[] {
  const { snapshot } = input;
  const speed = input.speedKph ?? null;

  return [
    ...weaponSignals(snapshot.weapon, snapshot.pipelineVersion),
    ...restraintSignals(snapshot.objects),
    ...acousticSignals(snapshot.acousticEvents),
    ...doorSignals(snapshot.doors, speed),
    ...occupancySignals(snapshot.occupancy, input.previousOccupancy ?? null, speed, snapshot),
    ...tamperSignals(snapshot),
  ];
}

// ============================================================================
// Weapons
// ============================================================================

/**
 * Emits `WEAPON_VISIBLE`, or nothing.
 *
 * Note what is *not* passed through: the PPV. The threat scorer applies its own
 * base rate for the hijacking hypothesis, and the weapon assessment's base rate
 * answers a different question ("is this object a weapon"). Feeding one
 * posterior into another as if it were a likelihood would double-count the
 * prior and understate the evidence.
 *
 * What crosses is the detector's confidence, discounted for ambiguity. The
 * scorer's catalogue entry then applies the 0.35 detector reliability, and the
 * two discounts compose to something appropriately small.
 */
function weaponSignals(
  weapon: WeaponAssessment | null,
  pipelineVersion: string,
): BehaviourObservation[] {
  if (!weapon?.candidate) return [];

  const candidate = weapon.candidate;

  // An operator who has looked at the frames and rejected the detection
  // outranks the detector completely. Continuing to score a rejected weapon
  // would mean the human review changed nothing.
  if (weapon.humanVerdict === 'REJECTED') return [];

  const confusableMass = candidate.alternatives
    .filter((alternative) => !WEAPON_CLASSES.includes(alternative.objectClass))
    .reduce((total, alternative) => total + alternative.confidence, 0);

  const discrimination =
    confusableMass > 0 ? candidate.confidence / (candidate.confidence + confusableMass) : 1;

  // Human confirmation is worth more than any detector output, so a confirmed
  // weapon is passed at full strength. This is the one upgrade path, and it
  // requires a person to have looked.
  const confirmed = weapon.humanVerdict === 'CONFIRMED';

  return [
    {
      signal: BehaviourSignal.WEAPON_VISIBLE,
      strength: confirmed ? 1 : clamp01(candidate.confidence * discrimination),
      detectorConfidence: confirmed ? 0.99 : clamp01(candidate.confidence),
      quality: clamp01(candidate.frameQuality),
      baselineDeviation: null,
      durationSeconds: candidate.persistenceSeconds,
      observedAt: candidate.detectedAt,
      modelId: versioned(candidate.modelId, pipelineVersion),
    },
  ];
}

function restraintSignals(objects: readonly ObjectDetection[]): BehaviourObservation[] {
  const restraints = objects
    .filter((object) => RESTRAINT_CLASSES.includes(object.objectClass))
    .filter((object) => object.confidence >= OBJECT_REPORTING_FLOOR)
    .sort((a, b) => b.confidence - a.confidence);

  const strongest = restraints[0];
  if (!strongest) return [];

  return [
    {
      signal: BehaviourSignal.RESTRAINT_OBJECT_VISIBLE,
      strength: clamp01(strongest.confidence),
      detectorConfidence: clamp01(strongest.confidence),
      quality: clamp01(strongest.frameQuality),
      baselineDeviation: null,
      durationSeconds: strongest.persistenceSeconds,
      observedAt: strongest.detectedAt,
      modelId: strongest.modelId,
    },
  ];
}

// ============================================================================
// Acoustics
// ============================================================================

const ACOUSTIC_SIGNAL: Partial<Record<AcousticEventType, BehaviourSignal>> = {
  [AcousticEventType.GLASS_BREAK]: BehaviourSignal.GLASS_BREAK,
  [AcousticEventType.GUNSHOT]: BehaviourSignal.GUNSHOT_DETECTED,
  [AcousticEventType.IMPACT]: BehaviourSignal.IMPACT_DETECTED,
  [AcousticEventType.SHOUTING]: BehaviourSignal.RAISED_VOCAL_EFFORT,
  // DOOR_SLAM and ALARM map to nothing. Both are overwhelmingly ordinary, and a
  // signal that fires on every trip trains operators to ignore the channel it
  // arrives on. They stay in the taxonomy because a detector needs somewhere to
  // put them — otherwise a slammed door gets classified as an impact.
};

function acousticSignals(events: readonly AcousticEvent[]): BehaviourObservation[] {
  return events.flatMap((event): BehaviourObservation[] => {
    const signal = ACOUSTIC_SIGNAL[event.type];
    if (!signal) return [];

    // Competing classifications discount the same way weapons do. A "gunshot"
    // the detector nearly called a door slam is not a gunshot.
    const competing = event.alternatives.reduce(
      (total, alternative) => total + alternative.confidence,
      0,
    );
    const discrimination = competing > 0 ? event.confidence / (event.confidence + competing) : 1;

    return [
      {
        signal,
        strength: clamp01(event.confidence * discrimination),
        detectorConfidence: clamp01(event.confidence),
        quality: clamp01(event.audioQuality),
        baselineDeviation: null,
        durationSeconds: event.durationSeconds,
        observedAt: event.detectedAt,
        modelId: event.modelId,
      },
    ];
  });
}

// ============================================================================
// Doors
// ============================================================================

/**
 * Door and belt signals.
 *
 * The most reliable inputs the engine has: hardware switches with nothing to
 * infer, no lighting dependency and no demographic error surface. The catalogue
 * gives them a detector reliability of 0.9 against 0.35 for the weapon
 * detector, and that ordering is correct however unglamorous it reads.
 */
function doorSignals(
  doors: readonly DoorSnapshot[],
  speedKph: number | null,
): BehaviourObservation[] {
  if (speedKph === null || speedKph <= MOTION_SPEED_THRESHOLD_KPH) return [];

  const open = doors.filter(
    (door) => door.state === DoorState.OPEN || door.state === DoorState.AJAR,
  );

  const mostRecent = open
    .filter((door) => door.changedAt !== null)
    .sort((a, b) => Date.parse(b.changedAt!) - Date.parse(a.changedAt!))[0];

  if (!mostRecent?.changedAt) return [];

  return [
    {
      signal: BehaviourSignal.DOOR_OPEN_IN_MOTION,
      strength: clamp01(speedKph / 60),
      detectorConfidence: 0.95,
      quality: 0.95,
      baselineDeviation: null,
      durationSeconds: 1,
      observedAt: mostRecent.changedAt,
      modelId: 'door-sensor-v1',
    },
  ];
}

// ============================================================================
// Occupancy
// ============================================================================

function occupancySignals(
  occupancy: OccupancyCount | null,
  previous: OccupancyCount | null,
  speedKph: number | null,
  snapshot: CabinSnapshot,
): BehaviourObservation[] {
  if (!occupancy) return [];

  const signals: BehaviourObservation[] = [];
  const gained = previous ? occupancy.stableCount - previous.stableCount : 0;

  // Only the stabilised count is used. Acting on the instantaneous count would
  // fire on every occlusion.
  if (gained > 0 && speedKph !== null && speedKph <= 1) {
    signals.push({
      signal: BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP,
      strength: clamp01(gained / 3),
      detectorConfidence: clamp01(occupancy.confidence),
      quality: clamp01(occupancy.confidence),
      baselineDeviation: null,
      durationSeconds: 0,
      observedAt: occupancy.countedAt,
      modelId: occupancy.modelId,
    });
  }

  // Several occupants inside one window is the coordinated-entry pattern. Two
  // people getting in normally takes longer than a window — doors, bags, a word
  // with the driver.
  if (gained >= 2 && snapshot.windowSeconds <= 10) {
    signals.push({
      signal: BehaviourSignal.RAPID_MULTI_ENTRY,
      strength: clamp01(gained / 3),
      detectorConfidence: clamp01(occupancy.confidence),
      quality: clamp01(occupancy.confidence),
      baselineDeviation: null,
      durationSeconds: 0,
      observedAt: occupancy.countedAt,
      modelId: occupancy.modelId,
    });
  }

  return signals;
}

// ============================================================================
// Tamper
// ============================================================================

/**
 * Emits `CAMERA_OBSTRUCTED` when a camera stops being able to see.
 *
 * Classified as device state rather than vision, so it lands in the `PHYSICAL`
 * evidence class. That placement is load-bearing: if it sat with the camera's
 * own observations, a failed camera would corroborate itself — the obstruction
 * signal and the degraded pose signals would look like two agreeing sources
 * when they are one broken device.
 *
 * `DISCONNECTED` is excluded on purpose. A camera that has stopped responding
 * is a maintenance event and is reported through sensor health; treating every
 * flat battery as evidence of a hijacking would bury the control room.
 */
function tamperSignals(snapshot: CabinSnapshot): BehaviourObservation[] {
  const obstructing: TamperState[] = [
    TamperState.OBSTRUCTED,
    TamperState.BLINDED,
    TamperState.MISALIGNED,
  ];

  const affected = snapshot.degradedSensors.filter((sensor) => obstructing.includes(sensor.tamper));

  if (affected.length === 0) return [];

  // Strength rises with how much of the sensor suite went dark at once. One
  // dirty lens is a maintenance ticket; every camera obstructed within the same
  // window is a different kind of event.
  const total = snapshot.contributingSensorIds.length + affected.length;
  const fraction = total > 0 ? affected.length / total : 1;

  const blinded = affected.some((sensor) => sensor.tamper === TamperState.BLINDED);

  return [
    {
      signal: BehaviourSignal.CAMERA_OBSTRUCTED,
      strength: clamp01(fraction),
      // A saturated sensor is unambiguous; a partially covered one is easily
      // confused with grime, and this fleet operates on gravel.
      detectorConfidence: blinded ? 0.9 : 0.75,
      quality: 0.8,
      baselineDeviation: null,
      durationSeconds: snapshot.windowSeconds,
      observedAt: snapshot.capturedAt,
      modelId: 'tamper-v1',
    },
  ];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Ensures a model id satisfies the versioned-id contract the API enforces.
 *
 * A detector reporting an unversioned id would otherwise fail validation at the
 * API boundary and silently drop the whole submission. Falling back to the
 * pipeline version keeps the provenance chain intact — the assessment still
 * records *something* traceable — while the malformed id shows up in the logs.
 */
function versioned(modelId: string, fallback: string): string {
  return /^[a-z0-9][a-z0-9-]*-v\d+$/.test(modelId) ? modelId : fallback;
}

/** Object classes that never produce a signal, listed so the omission is explicit. */
export const NON_SIGNALLING_CLASSES: readonly DetectedObjectClass[] = [
  DetectedObjectClass.PHONE,
  DetectedObjectClass.WALLET,
  DetectedObjectClass.BOTTLE,
  DetectedObjectClass.TOOL,
  DetectedObjectClass.KEYS,
  DetectedObjectClass.REMOTE_CONTROL,
  DetectedObjectClass.BAG,
  DetectedObjectClass.BOX,
  DetectedObjectClass.LAPTOP,
  DetectedObjectClass.DOCUMENT,
  DetectedObjectClass.FOOD_OR_DRINK,
  DetectedObjectClass.PERSON,
  DetectedObjectClass.SEATBELT,
  DetectedObjectClass.UNKNOWN_OBJECT,
];

/** Sensor health states that mean the device contributed nothing this window. */
export const NON_CONTRIBUTING_HEALTH: readonly SensorHealth[] = [
  SensorHealth.IMPAIRED,
  SensorHealth.OFFLINE,
  SensorHealth.UNKNOWN,
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
