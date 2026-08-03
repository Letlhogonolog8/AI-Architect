import type { ISODateString, TenantScoped, UUID } from './common';
import type { IncidentSeverity, ThreatLevel } from './enums';
import type { IdentityBand } from './identity';

/**
 * Behaviour Intelligence Engine.
 *
 * Answers a different question from the Continuous Identity Engine. Identity
 * asks *who is driving*; this asks **what is happening to the people in the
 * cabin, and does it look like a hijacking in progress?**
 *
 * The two engines share sensors and nothing else. A verified driver can be
 * under a gun, and an unrecognised driver is usually a colleague borrowing the
 * bakkie. Identity feeds this engine as one evidence class among several — see
 * `ThreatEvidenceClass` — but never substitutes for it.
 *
 * ## The rule that constrains this entire file
 *
 * **Nothing here infers an emotion.**
 *
 * There is no `fear`, no `anger`, no `stress level` as a psychological state.
 * The scientific consensus — Barrett et al. (2019), *Emotional Expressions
 * Reconsidered* — is that facial and vocal configurations do not reliably map
 * onto emotional states across people, cultures and contexts. A product that
 * claimed to read fear from a face would be wrong often, wrong unevenly across
 * demographics, and wrong in a direction that gets people hurt.
 *
 * So every type below describes an **observable physical measurement** —
 * skeletal geometry, motion energy, speech prosody, occupant count — and its
 * **deviation from that specific person's own baseline**. `arousalIndex` is a
 * label for "this body is doing more than it usually does", not for a feeling.
 * What that means is left to an operator with context the model does not have.
 *
 * ## The second rule
 *
 * **These signals may never be used to manage, rank or discipline a driver.**
 *
 * Under the EU AI Act, inferring emotion from workers is a prohibited practice
 * except where it serves the safety of the subject. Duress detection is exactly
 * that exception, and it is the *only* lawful basis this engine operates on.
 * Reusing the same signals to score driver performance would convert a safety
 * system into workplace surveillance and forfeit the basis it depends on.
 *
 * `BehaviourPolicy.permitPerformanceManagement` is typed as the literal
 * `false` so that the boundary is a compile error rather than a memo.
 *
 * See `docs/adr/0008-behaviour-intelligence.md`.
 */

// ============================================================================
// Signal catalogue
// ============================================================================

/**
 * What kind of measurement a signal comes from.
 *
 * Used to enforce corroboration: evidence from one modality is much weaker than
 * the same weight of evidence drawn from several, because a single failing
 * sensor produces a coherent-looking story all by itself.
 */
export const BehaviourSignalClass = {
  /** Skeletal keypoint geometry from the cabin camera. */
  POSTURE: 'POSTURE',
  /** Frame-to-frame motion energy. Coarse, robust, works in poor light. */
  MOTION: 'MOTION',
  /** Object detections from the cabin camera: weapons, restraints, contents. */
  OBJECT: 'OBJECT',
  /** Speech prosody from cabin audio. Never speech content. */
  VOCAL: 'VOCAL',
  /** Non-speech acoustic events: glass, impact, gunshot. Spectral, not semantic. */
  ACOUSTIC_EVENT: 'ACOUSTIC_EVENT',
  /** Cabin composition — occupant counts, doors, belts. Aggregate only. */
  CABIN: 'CABIN',
  /** Vehicle control inputs: steering, pedals, manoeuvre sequencing. */
  CONTROL: 'CONTROL',
  /** Sensor health and tamper. About the hardware, not about the scene. */
  DEVICE: 'DEVICE',
} as const;
export type BehaviourSignalClass = (typeof BehaviourSignalClass)[keyof typeof BehaviourSignalClass];

/**
 * The closed catalogue of observable behaviours the engine recognises.
 *
 * Closed on purpose. An open-ended "anomaly" output would let a model invent
 * categories nobody validated, and an operator would read meaning into a label
 * that was never tested. Adding a signal is a typed change that shows up in
 * review, alongside the calibration entry that says how much it is worth.
 *
 * Every name describes something a person watching the footage could point at.
 * None of them names a mental state.
 */
export const BehaviourSignal = {
  // -------------------------------------------------------------- posture
  /** Both wrists above shoulder height. The classic compliance posture. */
  HANDS_RAISED: 'HANDS_RAISED',
  /** Wrists adjacent and low for a sustained period — consistent with binding. */
  WRISTS_CONSTRAINED: 'WRISTS_CONSTRAINED',
  /** Neither hand near the wheel while the vehicle is moving. */
  HANDS_OFF_WHEEL_MOVING: 'HANDS_OFF_WHEEL_MOVING',
  /** Torso rotated away from forward for longer than a shoulder check. */
  TORSO_TURNED_SUSTAINED: 'TORSO_TURNED_SUSTAINED',
  /** Head and torso dropped below the normal seated envelope. */
  SLUMPED_POSTURE: 'SLUMPED_POSTURE',
  /** Driver keypoints absent while the vehicle is occupied and moving. */
  DRIVER_POSITION_VACATED: 'DRIVER_POSITION_VACATED',
  /** A non-driver occupant's keypoints inside the driver's space envelope. */
  OCCUPANT_ENCROACHING_DRIVER: 'OCCUPANT_ENCROACHING_DRIVER',

  // --------------------------------------------------------------- motion
  /** Whole-cabin motion energy far above this cabin's own baseline. */
  ELEVATED_MOTION_ENERGY: 'ELEVATED_MOTION_ENERGY',
  /** Abrupt large-amplitude movement — a struggle, or a pothole. */
  SUDDEN_MOTION_BURST: 'SUDDEN_MOTION_BURST',
  /** Periodic low-amplitude motion in the 4–12 Hz band. */
  TREMOR_BAND_MOTION: 'TREMOR_BAND_MOTION',
  /** Near-zero movement from an occupant over a long window while driving. */
  ABNORMAL_STILLNESS: 'ABNORMAL_STILLNESS',

  // -------------------------------------------------------------- objects
  //
  // Produced by the Cabin Intelligence Engine's vision pipeline. Same class as
  // posture, because the same camera produces both and the same camera failure
  // corrupts both.
  /**
   * An object classified as a weapon cleared the reporting floor.
   *
   * **Never sufficient on its own.** Cabin object detectors confuse handguns
   * with phones, wallets and bottles in exactly the conditions that matter, so
   * this signal carries a deliberately poor detector reliability and the
   * associated `WeaponAssessment` requires human confirmation by contract.
   */
  WEAPON_VISIBLE: 'WEAPON_VISIBLE',
  /** Rope, cable ties or tape visible in the occupant space. */
  RESTRAINT_OBJECT_VISIBLE: 'RESTRAINT_OBJECT_VISIBLE',

  // ---------------------------------------------------------------- vocal
  /** Sound pressure level sustained well above this cabin's baseline. */
  RAISED_VOCAL_EFFORT: 'RAISED_VOCAL_EFFORT',
  /** Fundamental frequency elevated against the speaker's own baseline. */
  PITCH_ELEVATION: 'PITCH_ELEVATION',
  /** Speaking rate departing sharply from the speaker's baseline. */
  SPEECH_RATE_DEPARTURE: 'SPEECH_RATE_DEPARTURE',
  /** Jitter and shimmer above baseline — measurable vocal instability. */
  VOCAL_INSTABILITY: 'VOCAL_INSTABILITY',
  /** More distinct speakers than the trip expects. Counted, never identified. */
  UNEXPECTED_SPEAKER_COUNT: 'UNEXPECTED_SPEAKER_COUNT',
  /** Speech absent for an implausibly long window in a multi-occupant cabin. */
  PROLONGED_SILENCE_OCCUPIED: 'PROLONGED_SILENCE_OCCUPIED',
  /**
   * The driver spoke their enrolled duress phrase.
   *
   * Not an inference. This is a deliberate act by the driver and is treated as
   * explicit evidence, in a class of its own — see `ThreatEvidenceClass`.
   */
  DURESS_PHRASE_SPOKEN: 'DURESS_PHRASE_SPOKEN',

  // ------------------------------------------------------ acoustic events
  //
  // Spectral signatures rather than speech. A breaking window and a gunshot are
  // short, loud and distinctive, and recognising them requires no understanding
  // of what anyone is saying — which is what makes a live cabin microphone
  // defensible at all.
  /** Breaking glass. Distinctive high-frequency signature; smash-and-grab. */
  GLASS_BREAK: 'GLASS_BREAK',
  /** Structural impact — a collision, a struck panel. */
  IMPACT_DETECTED: 'IMPACT_DETECTED',
  /**
   * A gunshot inside or immediately outside the cabin.
   *
   * Rare, loud and decisive, and an enclosed cabin is a far easier acoustic
   * problem than the outdoor gunshot-location systems whose accuracy has been
   * publicly contested. It still requires corroboration, because a backfire and
   * a slammed boot lid share much of the same envelope.
   */
  GUNSHOT_DETECTED: 'GUNSHOT_DETECTED',

  // ---------------------------------------------------------------- cabin
  /** Occupant count rose while the vehicle was stopped. */
  OCCUPANCY_INCREASE_AT_STOP: 'OCCUPANCY_INCREASE_AT_STOP',
  /** Several occupants entered within a few seconds. */
  RAPID_MULTI_ENTRY: 'RAPID_MULTI_ENTRY',
  /** A door opened above walking pace. */
  DOOR_OPEN_IN_MOTION: 'DOOR_OPEN_IN_MOTION',
  /** Driver's belt released above walking pace. */
  BELT_RELEASED_IN_MOTION: 'BELT_RELEASED_IN_MOTION',
  /**
   * A cabin camera stopped being able to see.
   *
   * A device-health signal, not a vision one — it fires precisely *because* the
   * camera failed, so grouping it with the camera's own observations would let
   * a broken sensor corroborate itself. A dirty lens and a lens covered thirty
   * seconds after an unexpected stop are indistinguishable from the image, and
   * the engine does not pretend otherwise.
   */
  CAMERA_OBSTRUCTED: 'CAMERA_OBSTRUCTED',

  // -------------------------------------------------------------- control
  /** Steering and pedal inputs far outside this driver's control baseline. */
  ERRATIC_CONTROL_INPUT: 'ERRATIC_CONTROL_INPUT',
  /** Several harsh manoeuvres inside a short window. */
  HARSH_MANOEUVRE_BURST: 'HARSH_MANOEUVRE_BURST',
  /** Sustained speed far above this driver's baseline for the road type. */
  UNCHARACTERISTIC_OVERSPEED: 'UNCHARACTERISTIC_OVERSPEED',
} as const;
export type BehaviourSignal = (typeof BehaviourSignal)[keyof typeof BehaviourSignal];

/**
 * One detected signal, at one moment.
 *
 * The unit the scoring engine consumes. `strength` is how pronounced the
 * measurement was; `detectorConfidence` is how sure the detector is that it
 * measured anything at all. They are separate because a faint signal seen
 * clearly and a strong signal seen through a dirty lens are different claims,
 * and collapsing them into one number loses exactly the distinction an operator
 * needs.
 */
export interface BehaviourObservation {
  signal: BehaviourSignal;
  /** 0-1. How far past the trigger threshold the measurement sat. */
  strength: number;
  /** 0-1. The detector's confidence that the signal is present at all. */
  detectorConfidence: number;
  /** 0-1. Input quality — lighting, cabin noise, occlusion. */
  quality: number;
  /**
   * Deviation from this subject's own baseline, in standard deviations.
   *
   * Null when no baseline exists yet. **A signal without a baseline is much
   * weaker evidence**, because "loud" only means something relative to how loud
   * this person usually is, and the engine downweights it accordingly.
   */
  baselineDeviation: number | null;
  /** How long the signal persisted. A half-second spike is usually a bump. */
  durationSeconds: number;
  observedAt: ISODateString;
  /** Versioned detector. An unversioned id makes the decision unauditable. */
  modelId: string;
}

// ============================================================================
// Arousal — stress detection, named honestly
// ============================================================================

/**
 * Physiological arousal indicators.
 *
 * **This is not stress, and it is not emotion.** It is a summary of how far the
 * body's observable activity has departed from its own resting pattern. High
 * arousal accompanies fear; it also accompanies running late, an argument on a
 * hands-free call, a favourite song and a hot cabin. The engine measures the
 * departure and refuses to name its cause.
 *
 * That refusal is the design. A field called `fearLevel` would be acted on as
 * though it meant fear, and it would be wrong most of the time it fired,
 * because the base rate of hijacking is far below the base rate of traffic.
 */
export interface ArousalAssessment {
  /**
   * 0-1 composite departure from baseline. Higher means more physical activity
   * than usual for this person — nothing more.
   */
  arousalIndex: number;
  /** 0-1 confidence in the index itself, driven by sensor quality and coverage. */
  confidence: number;
  /**
   * The measurements behind the index, each in standard deviations from this
   * subject's baseline. Surfaced so the number can be argued with.
   */
  indicators: ArousalIndicator[];
  /**
   * True when no usable baseline exists. The index is then computed against
   * population defaults and is **substantially less meaningful** — flagged
   * rather than hidden, because an operator would otherwise read it the same way.
   */
  baselineMissing: boolean;
  modelId: string;
  assessedAt: ISODateString;
}

export interface ArousalIndicator {
  /** e.g. `motion_energy`, `vocal_f0`, `speech_rate`, `postural_shift_rate`. */
  name: string;
  /** Standard deviations from this subject's baseline. */
  deviation: number;
  /** 0-1 quality of the measurement this deviation came from. */
  quality: number;
  signalClass: BehaviourSignalClass;
}

// ============================================================================
// Body pose
// ============================================================================

/**
 * Skeletal pose analysis for one occupant position.
 *
 * Keypoints are consumed and discarded inside the request. What persists is the
 * derived signal list — "hands raised", not a skeleton, and never a frame. A
 * retained keypoint series is a body-movement record of a named worker across
 * months, which is not something this product should hold.
 */
export interface PoseAssessment {
  /**
   * Which seat this describes. Positional, never an identity: `DRIVER` is the
   * driver's seat, not a person the engine claims to recognise.
   */
  position: OccupantPosition;
  /** Signals derived from the pose sequence. */
  signals: BehaviourObservation[];
  /** 0-1 fraction of expected keypoints that were actually resolved. */
  keypointCoverage: number;
  /** 0-1. Low in darkness, heavy occlusion, or extreme camera angles. */
  confidence: number;
  modelId: string;
  assessedAt: ISODateString;
}

export const OccupantPosition = {
  DRIVER: 'DRIVER',
  FRONT_PASSENGER: 'FRONT_PASSENGER',
  REAR_LEFT: 'REAR_LEFT',
  REAR_CENTRE: 'REAR_CENTRE',
  REAR_RIGHT: 'REAR_RIGHT',
  /** Detected but not attributable to a seat. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type OccupantPosition = (typeof OccupantPosition)[keyof typeof OccupantPosition];

// ============================================================================
// Voice stress
// ============================================================================

/**
 * Prosodic analysis of cabin speech.
 *
 * ## What this deliberately is not
 *
 * It is not layered voice stress analysis, and it is not a lie detector.
 * Commercial voice-stress products have failed independent validation
 * repeatedly — National Institute of Justice evaluations found deception
 * detection at chance. Any implementation registered behind this contract that
 * claims to detect deception is misusing it.
 *
 * What is measured are four standard, reproducible acoustic quantities —
 * fundamental frequency, jitter, shimmer, speaking rate — each expressed as a
 * departure from **this speaker's own** baseline. Those departures are real and
 * measurable. What causes them is not recoverable from audio.
 *
 * ## Content is never processed
 *
 * No transcription, no keyword spotting, no language identification. The one
 * exception is the enrolled duress phrase, which is matched acoustically
 * against a template the driver deliberately registered — the driver choosing
 * to send a signal, not the system reading their conversation.
 */
export interface VoiceStressAssessment {
  /** 0-1 composite prosodic departure from the speaker's baseline. */
  prosodicDeparture: number;
  /** The individual acoustic measures, in standard deviations from baseline. */
  measures: VoiceMeasure[];
  /** Distinct speakers detected. Counted, never identified. */
  speakerCount: number;
  /** Speakers the trip expected. Null when the trip declared nothing. */
  expectedSpeakerCount: number | null;
  /** True when the driver's enrolled duress phrase was matched. */
  duressPhraseDetected: boolean;
  /** 0-1 signal-to-noise of the analysed audio. Road noise ruins this quickly. */
  audioQuality: number;
  /** Seconds of clean speech the assessment is based on. */
  analysedSeconds: number;
  baselineMissing: boolean;
  modelId: string;
  assessedAt: ISODateString;
}

export interface VoiceMeasure {
  /** `f0_mean`, `f0_variability`, `jitter`, `shimmer`, `speech_rate`, `intensity`. */
  name: string;
  /** Standard deviations from this speaker's baseline. */
  deviation: number;
}

// ============================================================================
// Passenger behaviour
// ============================================================================

/**
 * Cabin dynamics — the passenger behaviour surface.
 *
 * **Aggregate only, and never per-person.** ADR-0007 established that
 * passengers are counted and never identified; this extends the same boundary
 * to behaviour. There is no per-passenger profile, no per-passenger score, and
 * no field in this type that could carry one.
 *
 * A passenger has not consented to being analysed, and there is no lawful basis
 * to build a behavioural record of one. The operationally useful signal — "two
 * people got into a stationary vehicle within four seconds and the driver's
 * hands went up" — is a property of the cabin, not of any individual in it.
 *
 * The one exception is an occupant enrolled under `EnrolledOccupant` with
 * explicit consent, and even then only their *position* is tracked, so that
 * "someone is leaning into the driver's space" can be distinguished from
 * "the driver's own child is in the back".
 */
export interface CabinBehaviourAssessment {
  occupantCount: number;
  expectedCount: number | null;
  /** Signals about the cabin as a whole. Never attributed to an individual. */
  signals: BehaviourObservation[];
  /** Pose per seat position. Positional, not identifying. */
  poses: PoseAssessment[];
  /** Seconds since the occupant count last changed. */
  secondsSinceOccupancyChange: number | null;
  /** 0-1 confidence in the cabin picture as a whole. */
  confidence: number;
  modelId: string;
  assessedAt: ISODateString;
}

// ============================================================================
// Abnormality
// ============================================================================

/**
 * How unusual this window is against the subject's own normal.
 *
 * Deliberately **not** against a population. A population model flags whoever
 * is least like the training set, which in practice means it flags the same
 * people repeatedly for driving while being themselves. Comparing a driver only
 * against their own history removes that failure mode entirely, at the cost of
 * needing a baseline before the engine can say anything — a trade this product
 * should take every time.
 */
export interface AbnormalityAssessment {
  /** 0-1. How far this window sits from the subject's own normal. */
  abnormalityScore: number;
  /** Named contributors, in standard deviations. Drives the explanation. */
  deviations: Array<{ feature: string; deviation: number; signalClass: BehaviourSignalClass }>;
  /** Windows the baseline was built from. Below the minimum it is unusable. */
  baselineWindowCount: number;
  /** True when the baseline is too thin to discriminate. */
  baselineInsufficient: boolean;
  /** 0-1 fraction of features that could be compared. */
  coverage: number;
  modelId: string;
  assessedAt: ISODateString;
}

/**
 * A subject's behavioural baseline for this engine.
 *
 * Separate from `BehaviourBaseline` in `identity.ts`, and the separation is
 * deliberate rather than duplication: that one holds *driving style* features
 * used to tell one person from another, this one holds *cabin state* features
 * used to tell one person's ordinary day from their worst one. Merging them
 * would let identity features leak into duress scoring, where a driver simply
 * being unlike their usual self would start reading as a threat.
 *
 * Summary statistics only. No frames, no audio, no keypoint series.
 */
export interface CabinBaseline extends TenantScoped {
  id: UUID;
  driverId: UUID;
  modelId: string;

  /** Observation windows folded in. Below `minimumWindows` it is not usable. */
  windowCount: number;
  observedMinutes: number;

  /** Feature name to running mean and standard deviation. */
  features: Record<string, { mean: number; standardDeviation: number }>;

  /**
   * Baselines expire. A person's ordinary changes — a new route, a new vehicle,
   * a recovered injury — and a stale baseline reads that change as a threat.
   */
  expiresAt: ISODateString | null;
  lastUpdatedAt: ISODateString;
  createdAt: ISODateString;
}

// ============================================================================
// Threat scoring
// ============================================================================

/**
 * Where a piece of evidence came from.
 *
 * The scoring engine requires corroboration **across** classes before it will
 * report a high threat. One class failing loudly — a camera pointed at the sun,
 * a microphone clipping on wind noise — produces a pile of mutually consistent
 * signals that look like overwhelming evidence and are in fact one broken
 * sensor. Independent classes are what make agreement mean something.
 *
 * ## These classes partition by sensor, not by subject matter
 *
 * That distinction decides the whole taxonomy and is easy to get wrong. A
 * weapon on a camera and a raised posture on the same camera are, semantically,
 * very different observations — but they share a failure mode, so they must
 * share a class or the corroboration cap does nothing. Conversely a raised
 * voice and a raised posture feel like the same finding and come from
 * completely independent hardware, so they belong apart.
 *
 * The rule: **two signals belong in the same class when one broken device could
 * produce both.**
 *
 * `ACOUSTIC` was split out of `BEHAVIOURAL` in Phase 6, when the Cabin
 * Intelligence Engine added microphone-derived events alongside the existing
 * prosody signals. Before the split, a camera and a microphone independently
 * agreeing earned no corroboration credit, which suppressed exactly the
 * multi-sensor evidence the engine exists to find.
 */
export const ThreatEvidenceClass = {
  /**
   * A deliberate act by the driver: panic button, duress phrase, duress PIN.
   *
   * The only class that is testimony rather than inference, and the only one
   * that can carry a high threat score on its own.
   */
  EXPLICIT: 'EXPLICIT',
  /**
   * Cabin **vision**: posture, motion, occupant counting, objects, weapons.
   * One obscured or blinded camera can produce every signal in this class.
   */
  BEHAVIOURAL: 'BEHAVIOURAL',
  /**
   * Cabin **audio**: prosody, speaker counts, glass break, impact, gunshot.
   * One failed or wind-saturated microphone can produce every signal here.
   */
  ACOUSTIC: 'ACOUSTIC',
  /** The Continuous Identity Engine's band. */
  IDENTITY: 'IDENTITY',
  /** Location, route and environment: hotspots, tailing, unusual stops. */
  CONTEXTUAL: 'CONTEXTUAL',
  /**
   * Vehicle **hardware**: door and belt switches, control inputs, sensor
   * health and tamper, jamming, signal loss.
   *
   * The most reliable class in the engine, and the least interesting-sounding.
   * A door switch has nothing to infer, no lighting dependency and no
   * demographic error surface.
   */
  PHYSICAL: 'PHYSICAL',
} as const;
export type ThreatEvidenceClass = (typeof ThreatEvidenceClass)[keyof typeof ThreatEvidenceClass];

/** One evidence item's contribution to the threat score. */
export interface ThreatContribution {
  evidenceClass: ThreatEvidenceClass;
  /** Stable identifier for what was observed, e.g. a `BehaviourSignal`. */
  source: string;
  /**
   * Likelihood ratio: how much more probable this observation is during a
   * hijacking than during ordinary driving. Above 1 raises suspicion.
   */
  likelihoodRatio: number;
  /** Effective weight after quality, decay and the correlation discount. */
  weight: number;
  /** Signed contribution in log10 units. Sums to the total across items. */
  contribution: number;
  ageSeconds: number;
  description: string;
}

/**
 * The engine's headline output.
 *
 * ## Why there are two numbers
 *
 * `score` is evidence strength on a 0-100 scale. It is monotone in the weight
 * of evidence and it is what drives the band, the alert and the dispatch
 * decision. It answers "how much is going on here".
 *
 * `positivePredictiveValue` is the calibrated probability that a hijacking is
 * actually in progress, given the same evidence **and the base rate**. It
 * answers "and how often will this be real".
 *
 * They diverge enormously, and that divergence is the single most important
 * thing this engine communicates. Hijacking is rare — on the order of one event
 * per tens of thousands of trip-hours. Against a base rate that low, evidence
 * strong enough to score 80 can still be wrong four times in five. An operator
 * shown only the 80 will dispatch armed responders as though it were a
 * certainty; an operator shown both will send someone to look.
 *
 * Suppressing the PPV because it makes the product look weak would be the
 * dishonest choice, and it is the one that gets an innocent person shot.
 */
export interface ThreatScore {
  /** 0-100 evidence strength. Drives the band and the response. */
  score: number;
  level: ThreatLevel;
  /**
   * 0-1 posterior probability that this is a genuine event, given the base
   * rate. Typically far below what the score alone suggests. Always displayed
   * alongside the score, never instead of it.
   */
  positivePredictiveValue: number;
  /** The base rate the PPV was computed against. Recorded, because it is a choice. */
  baseRatePerTripHour: number;
  /** Combined likelihood ratio, log10. The score is a display mapping of this. */
  logLikelihoodRatio: number;

  contributions: ThreatContribution[];
  /** Evidence classes that contributed at all. Corroboration is counted here. */
  corroboratingClasses: ThreatEvidenceClass[];
  /**
   * True when the score was held below its arithmetic value because all the
   * evidence came from a single class. The reason is in `capReason`.
   */
  corroborationCapped: boolean;
  capReason: string | null;

  /** Generated from the contributions, so it cannot drift from the arithmetic. */
  explanation: string[];
  scoredAt: ISODateString;
  policyVersion: string;
}

// ============================================================================
// Assessment record
// ============================================================================

/**
 * A durable behaviour assessment.
 *
 * Written for every evaluation, including the quiet ones. A gap in the record
 * is indistinguishable from the engine having been switched off, and in an
 * investigation that difference matters.
 */
export interface BehaviourAssessment extends TenantScoped {
  id: UUID;
  driverId: UUID | null;
  vehicleId: UUID | null;

  threat: ThreatScore;
  arousal: ArousalAssessment | null;
  voice: VoiceStressAssessment | null;
  cabin: CabinBehaviourAssessment | null;
  abnormality: AbnormalityAssessment | null;

  /** The identity band at scoring time, when one was available. */
  identityBand: IdentityBand | null;

  /** All signals that fired in this window, across every analyser. */
  signals: BehaviourObservation[];

  /**
   * Set when the evidence pattern is consistent with the driver acting under
   * coercion. Handled covertly — see `DuressAssessment`.
   */
  duress: DuressAssessment | null;

  assessedAt: ISODateString;
  policyVersion: string;
}

/**
 * Suspected duress.
 *
 * ## Why this is handled differently from everything else
 *
 * A duress signal must never be observable from inside the vehicle. No prompt,
 * no chime, no visible status change, no "are you okay?" notification. An
 * attacker who sees the system react knows the driver triggered something, and
 * the person who pays for that is the driver.
 *
 * This mirrors the reasoning in ADR-0007 for the `IMPOSTOR` band, which
 * deliberately does not challenge the driver, and it is why
 * `BehaviourPolicy.notifyDriver` is `false` at every level that could indicate
 * coercion.
 *
 * The corollary is that a duress assessment can never be resolved by asking. It
 * is resolved by an operator observing, or by contacting someone who is not in
 * the vehicle.
 */
export interface DuressAssessment {
  /** True when the pattern is consistent with coercion. Not proof of it. */
  indicated: boolean;
  /** 0-1 confidence. Low values are common and must not be rounded up. */
  confidence: number;
  /** True when the driver deliberately signalled — phrase, PIN, covert gesture. */
  deliberateSignal: boolean;
  /** Which observations drove it. */
  basis: string[];
  /**
   * Always `true`. Present so that any code path surfacing this to the vehicle
   * has to explicitly ignore a field that says not to.
   */
  suppressInVehicleFeedback: true;
}

// ============================================================================
// Policy
// ============================================================================

/**
 * What the platform may do at each threat level.
 *
 * Two constraints are typed as literals rather than booleans, so that changing
 * either is a deliberate type change visible in review:
 *
 * `permitAutonomousImmobilisation` — `false` everywhere, for the reasons set
 * out in ADR-0007. Behaviour evidence is weaker than identity evidence, not
 * stronger, so if identity cannot stop a vehicle then neither can this.
 *
 * `permitPerformanceManagement` — `false` everywhere. These signals exist to
 * protect the driver. Reusing them to rank or discipline them would convert a
 * safety system into workplace surveillance, and forfeit the lawful basis the
 * whole engine depends on.
 */
export interface BehaviourPolicy {
  level: ThreatLevel;
  raiseAlert: boolean;
  alertSeverity: IncidentSeverity | null;
  openIncident: boolean;
  /** Increase evidence capture rate — video, audio, telemetry. */
  escalateCapture: boolean;
  /** Put the vehicle on the control-room watch list without alerting. */
  silentMonitoring: boolean;
  /**
   * Whether anything may be shown to the driver.
   *
   * False wherever duress is plausible. A visible reaction warns an attacker
   * that the system has noticed, in front of the person it is protecting.
   */
  notifyDriver: boolean;
  /** Recommend an operator make contact by a channel outside the vehicle. */
  recommendExternalContact: boolean;

  permitAutonomousImmobilisation: false;
  permitPerformanceManagement: false;

  description: string;
}
