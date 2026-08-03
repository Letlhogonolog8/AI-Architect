import type { ISODateString, TenantScoped, UUID } from './common';

/**
 * Cabin Intelligence Engine.
 *
 * The perception layer. Everything upstream of this file consumes *signals*;
 * this is where signals come from — cameras, microphones, seat sensors and door
 * switches, and the detectors that turn their output into something the
 * Behaviour Intelligence Engine can score.
 *
 * ## Relationship to the rest of the platform
 *
 * ```
 *   Cabin Intelligence  (this file)      sensors → detections
 *            ↓
 *   Behaviour Intelligence (behaviour.ts) detections → signals → threat score
 *            ↓
 *   Identity Engine (identity.ts)         occupancy counts, never identities
 * ```
 *
 * Phase 5 shipped the scorer with its perception front-ends absent and its
 * routes returning 501. This is those front-ends. The contracts here are the
 * producers for `BehaviourSignal`, and `services/ai/app/cabin/` is where a
 * model gets registered against them.
 *
 * ## The three rules that constrain this file
 *
 * **1. No frame or audio buffer is ever persisted by default.** Cabin sensors
 * point at workers for their entire shift. What is retained is a *detection* —
 * a class, a confidence, a box — never the pixels it came from. Frames are
 * retained only when an incident is opened, under the evidence chain of
 * custody, with its retention clock and its audit trail.
 *
 * **2. Detection is not identification.** ADR-0007 established that occupants
 * are counted and never identified; ADR-0008 extended that to behaviour. This
 * extends it to vision: no face embedding is computed here, no occupant is
 * tracked across trips, and `OccupancyCount` is a number.
 *
 * **3. A detector's uncertainty is reported, not resolved.** `ObjectDetection`
 * carries an *ambiguity set* rather than a winning label, because the single
 * most dangerous thing this engine could do is print "WEAPON" when the detector
 * was choosing between a handgun and a mobile phone. See `WeaponAssessment`.
 *
 * See `docs/adr/0009-cabin-intelligence.md`.
 */

// ============================================================================
// Devices
// ============================================================================

/**
 * Where a cabin sensor is mounted.
 *
 * Placement is not cosmetic — it determines which detections are even
 * meaningful. A driver-facing camera cannot count rear occupants, and treating
 * its count as authoritative would silently under-report exactly the situation
 * that matters.
 */
export const CameraPlacement = {
  /** Faces the driver's seat. Pose and driver-position signals. */
  DRIVER_FACING: 'DRIVER_FACING',
  /** Wide interior view. Occupancy counting and cabin dynamics. */
  CABIN_WIDE: 'CABIN_WIDE',
  /** Rear bench. Rear occupancy and encroachment. */
  REAR_CABIN: 'REAR_CABIN',
  /** Cargo or boot area. Object detection only; no occupancy expected. */
  CARGO: 'CARGO',
} as const;
export type CameraPlacement = (typeof CameraPlacement)[keyof typeof CameraPlacement];

/**
 * Operational health of a cabin sensor.
 *
 * Distinct from `CameraStatus` in `command-centre.ts`, which describes what an
 * operator's video tile is doing. This describes whether the device can be
 * *relied on*, which is a different question with a different answer: a camera
 * can be streaming perfectly and still be useless because someone taped over it.
 */
export const SensorHealth = {
  HEALTHY: 'HEALTHY',
  /** Producing frames, but quality is below the analysis threshold. */
  DEGRADED: 'DEGRADED',
  /** Reachable but not producing usable output. */
  IMPAIRED: 'IMPAIRED',
  OFFLINE: 'OFFLINE',
  /** Never enrolled against this vehicle, or removed. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type SensorHealth = (typeof SensorHealth)[keyof typeof SensorHealth];

/**
 * Why a camera cannot see.
 *
 * Deliberately a first-class state rather than a low-quality score, because
 * these are two different facts with opposite operational meanings. A dirty
 * lens is a maintenance ticket. A lens covered thirty seconds after an
 * unexpected stop is evidence.
 *
 * The engine cannot tell them apart from the image alone and does not try —
 * it reports the obstruction and lets corroboration decide.
 */
export const TamperState = {
  CLEAR: 'CLEAR',
  /** Physically covered — tape, cloth, a hand. */
  OBSTRUCTED: 'OBSTRUCTED',
  /** Saturated by a bright light pointed at the lens. */
  BLINDED: 'BLINDED',
  /** Focus or aim has shifted from the calibrated frame. */
  MISALIGNED: 'MISALIGNED',
  /** Powered but sending no frames. */
  DISCONNECTED: 'DISCONNECTED',
} as const;
export type TamperState = (typeof TamperState)[keyof typeof TamperState];

/**
 * A cabin sensor enrolled against a vehicle.
 *
 * ## On the recording indicator
 *
 * `recordingIndicatorFitted` is required, not optional, and an installation
 * without one is a compliance failure rather than a configuration choice.
 * Workers under continuous camera observation must know the camera is there.
 *
 * The indicator must be **constantly illuminated whenever the device is
 * powered** — never driven by detection state. A light that changes when the
 * engine notices something tells an attacker the system has reacted, in front
 * of the driver it is protecting, which is the precise failure ADR-0008
 * decision 5 exists to prevent. A constant light discloses everything the
 * driver is owed and nothing an attacker can use.
 */
export interface CabinSensor extends TenantScoped {
  id: UUID;
  vehicleId: UUID;
  /** Stable hardware serial. The enrolment key. */
  serialNumber: string;
  label: string;
  placement: CameraPlacement;
  /** True for a microphone-only device; `placement` is then advisory. */
  audioOnly: boolean;

  health: SensorHealth;
  tamper: TamperState;
  /** 0-1 rolling mean frame quality. Gates whether analysis runs at all. */
  meanQuality: number;

  /** Whether on-device analysis is enabled. Off means the device is a recorder only. */
  analysisEnabled: boolean;
  /** Required by law in the launch market, and by this contract. */
  recordingIndicatorFitted: boolean;

  firmwareVersion: string;
  lastFrameAt: ISODateString | null;
  lastSeenAt: ISODateString | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ============================================================================
// Object detection
// ============================================================================

/**
 * The closed object taxonomy.
 *
 * ## Why the confusable objects are in the list
 *
 * `PHONE`, `WALLET`, `BOTTLE`, `TOOL` and `KEYS` are not here because anyone
 * needs to know a driver has keys. They are here because **they are what a
 * handgun gets confused with**, and a detector that can only output weapon
 * classes has no way to say "this is probably a phone".
 *
 * A model restricted to threat classes will label a dark rectangular object in
 * a hand as a handgun with whatever confidence its softmax produces, because
 * that is the only answer available to it. Including the confusable classes
 * gives the ambiguity somewhere to go, and lets `ObjectDetection.alternatives`
 * carry it to the operator instead of discarding it.
 *
 * This is the single most important design decision in the file.
 */
export const DetectedObjectClass = {
  // --- threat-relevant
  HANDGUN: 'HANDGUN',
  LONG_GUN: 'LONG_GUN',
  KNIFE: 'KNIFE',
  BLUNT_WEAPON: 'BLUNT_WEAPON',

  // --- restraint-relevant
  ROPE_OR_STRAP: 'ROPE_OR_STRAP',
  CABLE_TIE: 'CABLE_TIE',
  ADHESIVE_TAPE: 'ADHESIVE_TAPE',

  // --- the confusables. Present so ambiguity has somewhere to go.
  PHONE: 'PHONE',
  WALLET: 'WALLET',
  BOTTLE: 'BOTTLE',
  TOOL: 'TOOL',
  KEYS: 'KEYS',
  REMOTE_CONTROL: 'REMOTE_CONTROL',

  // --- ordinary cabin contents
  BAG: 'BAG',
  BOX: 'BOX',
  LAPTOP: 'LAPTOP',
  DOCUMENT: 'DOCUMENT',
  FOOD_OR_DRINK: 'FOOD_OR_DRINK',

  // --- structural
  PERSON: 'PERSON',
  SEATBELT: 'SEATBELT',
  UNKNOWN_OBJECT: 'UNKNOWN_OBJECT',
} as const;
export type DetectedObjectClass = (typeof DetectedObjectClass)[keyof typeof DetectedObjectClass];

/** Classes that make an object a candidate weapon. */
export const WEAPON_CLASSES: readonly DetectedObjectClass[] = [
  DetectedObjectClass.HANDGUN,
  DetectedObjectClass.LONG_GUN,
  DetectedObjectClass.KNIFE,
  DetectedObjectClass.BLUNT_WEAPON,
];

/** Classes consistent with restraining a person. */
export const RESTRAINT_CLASSES: readonly DetectedObjectClass[] = [
  DetectedObjectClass.ROPE_OR_STRAP,
  DetectedObjectClass.CABLE_TIE,
  DetectedObjectClass.ADHESIVE_TAPE,
];

/**
 * One object the detector found.
 *
 * `alternatives` is the product, not diagnostic detail. An operator deciding
 * whether to treat a driver as armed must see that the model was choosing
 * between a handgun at 0.55 and a phone at 0.38 — because those are the same
 * pixels, and the second reading is the far more common one.
 */
export interface ObjectDetection {
  objectClass: DetectedObjectClass;
  /** 0-1 confidence in `objectClass`. */
  confidence: number;
  /**
   * Competing classifications above the reporting floor, strongest first.
   * Excludes `objectClass` itself. Empty means the detector was unambiguous,
   * which for a weapon class should be rare and is itself worth noticing.
   */
  alternatives: Array<{ objectClass: DetectedObjectClass; confidence: number }>;
  /** Normalised `[x, y, width, height]`, origin top-left. */
  boundingBox: [number, number, number, number];
  /** Seat the object is nearest to. Positional, never an identity. */
  nearestPosition: SeatPosition | null;
  /** Consecutive frames the object has been tracked for. */
  persistenceFrames: number;
  persistenceSeconds: number;
  /** 0-1 quality of the frames this came from. */
  frameQuality: number;
  modelId: string;
  detectedAt: ISODateString;
}

// ============================================================================
// Weapons
// ============================================================================

/**
 * A candidate weapon, with everything needed to distrust it.
 *
 * ## Why this type is so defensive
 *
 * A false weapon detection in this product sends armed responders to an
 * innocent person. It is the highest-consequence output the platform can
 * produce, and the deployed track record of the technology is poor: AI weapons
 * screening has been the subject of an FTC enforcement action over accuracy
 * claims, and cabin-scale object detection routinely confuses phones, wallets
 * and bottles with handguns in exactly the conditions that matter — low light,
 * partial occlusion, motion blur, an object held rather than laid flat.
 *
 * So this type reports a candidate and, in the same breath, everything that
 * argues against it: the alternatives, the frame quality, the base rate, and
 * whether anything other than this one camera agrees.
 *
 * `requiresHumanConfirmation` is typed as the literal `true`. There is no
 * confidence at which a weapon detection becomes a fact.
 */
export interface WeaponAssessment {
  /** Present only when a weapon class cleared the reporting floor. */
  candidate: ObjectDetection | null;
  /**
   * 0-1 posterior that a weapon is genuinely present, given the detection, the
   * ambiguity set and the base rate. Typically far below `candidate.confidence`
   * and always displayed with it — the same discipline as `ThreatScore`.
   */
  positivePredictiveValue: number;
  /** Weapons visible per cabin-hour, the rate the PPV was computed against. */
  baseRatePerCabinHour: number;

  /**
   * True when a sensor other than the camera that saw it also indicates a
   * threat. Weapon detections do not escalate on their own.
   */
  corroborated: boolean;
  corroboratingSources: string[];

  /** Why the detection should be doubted. Always populated when a candidate exists. */
  caveats: string[];

  /**
   * Always `true`. A weapon detection is a reason to look at the footage, never
   * a finding of fact, and no threshold changes that.
   */
  requiresHumanConfirmation: true;

  /** Set once an operator has viewed the frames and made a determination. */
  humanVerdict: 'CONFIRMED' | 'REJECTED' | null;
  verifiedByUserId: UUID | null;
  verifiedAt: ISODateString | null;

  modelId: string;
  assessedAt: ISODateString;
}

// ============================================================================
// Occupancy and seats
// ============================================================================

export const SeatPosition = {
  DRIVER: 'DRIVER',
  FRONT_PASSENGER: 'FRONT_PASSENGER',
  REAR_LEFT: 'REAR_LEFT',
  REAR_CENTRE: 'REAR_CENTRE',
  REAR_RIGHT: 'REAR_RIGHT',
} as const;
export type SeatPosition = (typeof SeatPosition)[keyof typeof SeatPosition];

export const SeatState = {
  OCCUPIED: 'OCCUPIED',
  EMPTY: 'EMPTY',
  /** Something is on the seat that is not a person — a bag, a box. */
  OBJECT: 'OBJECT',
  /** The seat cannot be seen or sensed. Not the same as empty. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type SeatState = (typeof SeatState)[keyof typeof SeatState];

/** Where a seat's state came from. Fusion needs to know; so does an investigator. */
export const SeatEvidenceSource = {
  VISION: 'VISION',
  WEIGHT_SENSOR: 'WEIGHT_SENSOR',
  BELT_SENSOR: 'BELT_SENSOR',
  /** Agreement across more than one of the above. */
  FUSED: 'FUSED',
} as const;
export type SeatEvidenceSource = (typeof SeatEvidenceSource)[keyof typeof SeatEvidenceSource];

export interface SeatOccupancy {
  position: SeatPosition;
  state: SeatState;
  /** 0-1 confidence in `state`. */
  confidence: number;
  source: SeatEvidenceSource;
  /** True when the sources disagreed. The disagreement is kept, not averaged away. */
  conflicted: boolean;
  beltFastened: boolean | null;
}

/**
 * How many people are in the cabin.
 *
 * **A count and nothing else.** No embeddings, no attributes, no per-occupant
 * record — ADR-0007 decision 4, carried into the perception layer where it is
 * actually enforceable.
 *
 * `stableCount` is what everything downstream should use. Raw per-frame counts
 * flicker badly in real cabins — an occupant leans out of frame, a headrest
 * occludes a face — and a system that alerted on raw counts would report a
 * phantom passenger several times per trip.
 */
export interface OccupancyCount {
  /** Detections in the most recent frame. Noisy; rarely the right thing to use. */
  instantaneousCount: number;
  /** Temporally stabilised count. The figure downstream consumers should read. */
  stableCount: number;
  /** Expected for this trip, when the trip declared one. */
  expectedCount: number | null;
  /** Per-seat breakdown, when seat attribution was possible. */
  seats: SeatOccupancy[];
  /** 0-1 confidence in `stableCount`. */
  confidence: number;
  /** Seconds the stable count has held. Short holds are not yet trustworthy. */
  stableForSeconds: number;
  /** True when the count exceeds expectation by more than the tolerance. */
  unexpectedOccupancy: boolean;
  /**
   * Seats no sensor could resolve. Reported because "we counted two" and "we
   * counted two and could not see the back row" are different claims.
   */
  unobservedPositions: SeatPosition[];
  modelId: string;
  countedAt: ISODateString;
}

// ============================================================================
// Doors
// ============================================================================

export const DoorPosition = {
  DRIVER: 'DRIVER',
  FRONT_PASSENGER: 'FRONT_PASSENGER',
  REAR_LEFT: 'REAR_LEFT',
  REAR_RIGHT: 'REAR_RIGHT',
  BOOT: 'BOOT',
  BONNET: 'BONNET',
} as const;
export type DoorPosition = (typeof DoorPosition)[keyof typeof DoorPosition];

export const DoorState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  /** Latched but not fully closed. */
  AJAR: 'AJAR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type DoorState = (typeof DoorState)[keyof typeof DoorState];

/**
 * Door and lock state.
 *
 * The most reliable input the Cabin Intelligence Engine has, and by some margin.
 * These are hardware switches — there is nothing to infer, no model, no
 * lighting dependency and no demographic error surface. When the scorer weights
 * a door sensor above a prosody measurement it is not being crude; it is being
 * correct.
 */
export interface DoorSnapshot {
  position: DoorPosition;
  state: DoorState;
  locked: boolean | null;
  changedAt: ISODateString | null;
  /** Vehicle speed when the state last changed. Turns a fact into an event. */
  speedKphAtChange: number | null;
}

// ============================================================================
// Audio
// ============================================================================

/**
 * Acoustic events.
 *
 * **Events, never content.** No transcription, no keyword spotting, no language
 * identification. These are spectral signatures — a breaking window and a
 * gunshot have distinctive, short, loud profiles that are recognisable without
 * any understanding of what anyone is saying.
 *
 * That boundary is what makes continuous cabin audio defensible at all. A
 * microphone that listens for glass breaking is a smoke detector. A microphone
 * that transcribes is surveillance of a worker's conversations, including with
 * their family, their doctor and their union.
 */
export const AcousticEventType = {
  GLASS_BREAK: 'GLASS_BREAK',
  /** Structural impact — a collision, a struck panel. */
  IMPACT: 'IMPACT',
  GUNSHOT: 'GUNSHOT',
  DOOR_SLAM: 'DOOR_SLAM',
  /** Vehicle alarm or horn. */
  ALARM: 'ALARM',
  /** Sustained sound pressure well above the cabin's own baseline. */
  SHOUTING: 'SHOUTING',
} as const;
export type AcousticEventType = (typeof AcousticEventType)[keyof typeof AcousticEventType];

export interface AcousticEvent {
  type: AcousticEventType;
  /** 0-1 detector confidence. */
  confidence: number;
  /** Peak sound pressure, dB SPL. Absolute, unlike the prosody measures. */
  peakDb: number;
  durationSeconds: number;
  /** 0-1 signal-to-noise of the window. Road noise ruins this quickly. */
  audioQuality: number;
  /** Competing classifications, as for `ObjectDetection`. */
  alternatives: Array<{ type: AcousticEventType; confidence: number }>;
  modelId: string;
  detectedAt: ISODateString;
}

// ============================================================================
// Aggregate
// ============================================================================

/**
 * Everything the cabin knows at one moment.
 *
 * The unit the Behaviour Intelligence Engine consumes. Assembled per analysis
 * window rather than per frame — a per-frame pipeline would produce forty
 * assessments a second, each individually meaningless, and would make the
 * within-class correlation discount do all the work.
 */
export interface CabinSnapshot extends TenantScoped {
  id: UUID;
  vehicleId: UUID;
  /** Sensors that contributed. A short list is itself information. */
  contributingSensorIds: UUID[];

  occupancy: OccupancyCount | null;
  objects: ObjectDetection[];
  weapon: WeaponAssessment | null;
  doors: DoorSnapshot[];
  acousticEvents: AcousticEvent[];

  /** Sensors that could not contribute, and why. */
  degradedSensors: Array<{ sensorId: UUID; health: SensorHealth; tamper: TamperState }>;

  windowSeconds: number;
  capturedAt: ISODateString;
  /** Versioned pipeline. Changing detectors changes outcomes; both are recorded. */
  pipelineVersion: string;
}

/**
 * Retention policy for cabin media.
 *
 * Typed rather than configured, so that turning on continuous retention is a
 * reviewable code change and not a checkbox in a settings page.
 */
export interface CabinRetentionPolicy {
  /**
   * Always `false`. Frames and audio are processed in a rolling buffer and
   * discarded. Retaining them by default would build a continuous video record
   * of a worker's shift, which no operational need here justifies.
   */
  retainMediaByDefault: false;
  /**
   * Seconds of pre-event buffer preserved when an incident is opened. The
   * minutes before an incident are the ones that matter and cannot be
   * recovered retrospectively, so a short buffer is held in memory and
   * committed to evidence only on escalation.
   */
  preIncidentBufferSeconds: number;
  /** Always `true`. Committed media enters the evidence chain of custody. */
  incidentMediaSealed: true;
}
