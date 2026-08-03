import {
  BehaviourSignal,
  BehaviourSignalClass,
  ThreatEvidenceClass,
  type BehaviourObservation,
} from '@aegisdrive/types';

/**
 * Signal calibration.
 *
 * ## What a likelihood ratio means here
 *
 * For each signal:
 *
 *     LR = P(signal observed | hijacking in progress)
 *          ────────────────────────────────────────────
 *          P(signal observed | ordinary driving)
 *
 * LR = 1 means the observation tells you nothing — it is equally likely either
 * way. Above 1 raises suspicion, below 1 lowers it. This is the same machinery
 * the Continuous Identity Engine uses, for the same reason: likelihood ratios
 * are commensurable across signals and combine under Bayes, whereas
 * hand-assigned "points" do not combine into anything meaningful.
 *
 * ## Why most of these numbers are small
 *
 * Because most of these behaviours are ordinary. People shout in cars. People
 * pick up passengers. People drive erratically when they are late. A raised
 * voice is roughly twice as likely during a hijacking as during a normal trip,
 * and a calibration that claimed otherwise would produce a system that treats
 * every argument on the N1 as an armed robbery.
 *
 * The high ratios are reserved for behaviours that are genuinely rare in
 * ordinary driving: hands raised above the shoulders, wrists held together, a
 * driver's seat vacated at speed. Even those are capped, because a single
 * signal must never be able to carry the score on its own.
 *
 * ## Where these numbers come from, and what that means
 *
 * They are **structured estimates, not measurements.** There is no public
 * dataset of hijackings with synchronised cabin video and audio, and there will
 * not be one soon — building it would require filming the event. The ratios
 * below are ordered by how distinctive each behaviour is in ordinary driving,
 * and their *relative* ordering is defensible. Their absolute magnitudes are
 * not, and `SIGNAL_CALIBRATION_SOURCE` records that so no assessment is ever silently
 * made against numbers nobody fitted.
 *
 * They must be refitted per deployment from confirmed incidents and matched
 * controls before this engine is used to dispatch anyone.
 */

export const SIGNAL_CALIBRATION_SOURCE = 'structured-estimates-v1' as const;

export interface SignalCalibration {
  signal: BehaviourSignal;
  signalClass: BehaviourSignalClass;
  evidenceClass: ThreatEvidenceClass;

  /** Likelihood ratio for a clean, confident detection of this signal. */
  likelihoodRatio: number;

  /**
   * How much to trust the class of detector that produces this signal, 0-1.
   *
   * This is a separate axis from the likelihood ratio, and conflating them is a
   * common way these systems mislead. The ratio says *how informative the
   * behaviour would be if it really happened*; reliability says *how often the
   * detector is right that it happened*. Hands raised is highly informative
   * (LR 60) and reasonably detectable (0.7). Vocal instability is barely
   * informative (LR 1.6) and poorly detectable (0.4), so it contributes almost
   * nothing — which is the correct outcome, not a bug to be tuned away.
   */
  detectorReliability: number;

  /** Half-life in seconds. How long the observation stays informative. */
  halfLifeSeconds: number;

  /** Below this detector confidence the observation is discarded, not weighted. */
  minimumConfidence: number;

  /**
   * Minimum seconds the signal must persist to count.
   *
   * Most false positives in cabin analysis are transients: a pothole reads as a
   * motion burst, a shoulder check reads as a sustained torso turn, a cough
   * reads as raised vocal effort. Requiring persistence removes the bulk of
   * them at almost no cost to genuine detection, because real events last.
   */
  minimumDurationSeconds: number;

  /**
   * Whether this signal only means anything relative to the subject's baseline.
   *
   * True for measurements — "louder than usual", "moving more than usual" —
   * where the absence of a baseline genuinely halves what the observation is
   * worth, because "loud" is undefined without knowing how loud this person
   * usually is.
   *
   * False for **categorical** detections: a weapon, breaking glass, a door open
   * at speed, hands above the shoulders. There is no personal baseline rate of
   * having a firearm in the cabin, and discounting these for a missing baseline
   * would suppress the strongest evidence the engine has — on a new driver,
   * permanently.
   *
   * This distinction was added in Phase 6. Before it, a hijacking with a weapon
   * on camera, breaking glass and a door open at 40 km/h scored 49 and raised
   * no alert, because every one of those signals had been halved for lacking a
   * baseline it could never have had.
   */
  baselineRelative: boolean;

  /** Human-readable, used to build the operator-facing explanation. */
  description: string;
}

const POSTURE = BehaviourSignalClass.POSTURE;
const MOTION = BehaviourSignalClass.MOTION;
const OBJECT = BehaviourSignalClass.OBJECT;
const VOCAL = BehaviourSignalClass.VOCAL;
const ACOUSTIC_EVENT = BehaviourSignalClass.ACOUSTIC_EVENT;
const CABIN = BehaviourSignalClass.CABIN;
const CONTROL = BehaviourSignalClass.CONTROL;
const DEVICE = BehaviourSignalClass.DEVICE;

// Evidence classes partition by *sensor*, not by subject matter: two signals
// share a class when one broken device could produce both. That is why the
// weapon detector sits with posture (same camera) and glass break sits with
// prosody (same microphone), despite the semantic pairing running the other way.
const BEHAVIOURAL = ThreatEvidenceClass.BEHAVIOURAL;
const ACOUSTIC = ThreatEvidenceClass.ACOUSTIC;
const PHYSICAL = ThreatEvidenceClass.PHYSICAL;
const EXPLICIT = ThreatEvidenceClass.EXPLICIT;

export const SIGNAL_CALIBRATION: Readonly<Record<BehaviourSignal, SignalCalibration>> =
  Object.freeze({
    // ------------------------------------------------------------- posture
    [BehaviourSignal.HANDS_RAISED]: {
      signal: BehaviourSignal.HANDS_RAISED,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      // Almost nobody raises both hands above their shoulders while seated in a
      // car for any ordinary reason.
      likelihoodRatio: 60,
      detectorReliability: 0.7,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 1.5,
      baselineRelative: false,
      description: 'Both hands raised above shoulder height',
    },
    [BehaviourSignal.WRISTS_CONSTRAINED]: {
      signal: BehaviourSignal.WRISTS_CONSTRAINED,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 40,
      // Hard to distinguish from hands resting together in the lap.
      detectorReliability: 0.5,
      halfLifeSeconds: 600,
      minimumConfidence: 0.6,
      minimumDurationSeconds: 8,
      baselineRelative: false,
      description: 'Wrists held together and low, consistent with restraint',
    },
    [BehaviourSignal.DRIVER_POSITION_VACATED]: {
      signal: BehaviourSignal.DRIVER_POSITION_VACATED,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 25,
      // Keypoint dropout in low light looks identical to an empty seat, which
      // is why this is trusted far less than its ratio would suggest.
      detectorReliability: 0.45,
      halfLifeSeconds: 180,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 4,
      baselineRelative: false,
      description: "No occupant detected in the driver's position while moving",
    },
    [BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER]: {
      signal: BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 12,
      detectorReliability: 0.6,
      halfLifeSeconds: 240,
      minimumConfidence: 0.55,
      minimumDurationSeconds: 3,
      baselineRelative: false,
      description: "A non-driver occupant inside the driver's space envelope",
    },
    [BehaviourSignal.TORSO_TURNED_SUSTAINED]: {
      signal: BehaviourSignal.TORSO_TURNED_SUSTAINED,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      // A long shoulder check, a conversation with the back seat, or being
      // held at gunpoint from behind. Mostly the first two.
      likelihoodRatio: 3,
      detectorReliability: 0.7,
      halfLifeSeconds: 180,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 6,
      baselineRelative: false,
      description: 'Torso rotated away from forward for longer than a shoulder check',
    },
    [BehaviourSignal.SLUMPED_POSTURE]: {
      signal: BehaviourSignal.SLUMPED_POSTURE,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      // Also the signature of a medical emergency, which is why the response
      // policy escalates to a human rather than to a countermeasure.
      likelihoodRatio: 3,
      detectorReliability: 0.65,
      halfLifeSeconds: 240,
      minimumConfidence: 0.55,
      minimumDurationSeconds: 5,
      baselineRelative: false,
      description: 'Occupant dropped below the normal seated envelope',
    },
    [BehaviourSignal.HANDS_OFF_WHEEL_MOVING]: {
      signal: BehaviourSignal.HANDS_OFF_WHEEL_MOVING,
      signalClass: POSTURE,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 2.5,
      detectorReliability: 0.7,
      halfLifeSeconds: 120,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 4,
      baselineRelative: false,
      description: 'Neither hand near the wheel while the vehicle is moving',
    },

    // -------------------------------------------------------------- motion
    [BehaviourSignal.ELEVATED_MOTION_ENERGY]: {
      signal: BehaviourSignal.ELEVATED_MOTION_ENERGY,
      signalClass: MOTION,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 2.5,
      detectorReliability: 0.75,
      halfLifeSeconds: 120,
      minimumConfidence: 0.4,
      minimumDurationSeconds: 3,
      baselineRelative: true,
      description: 'Cabin movement well above this cabin’s baseline',
    },
    [BehaviourSignal.SUDDEN_MOTION_BURST]: {
      signal: BehaviourSignal.SUDDEN_MOTION_BURST,
      signalClass: MOTION,
      evidenceClass: BEHAVIOURAL,
      // Struggles look like this. So do potholes, and South African roads
      // supply far more potholes than struggles.
      likelihoodRatio: 2,
      detectorReliability: 0.6,
      halfLifeSeconds: 90,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 0.5,
      baselineRelative: false,
      description: 'Abrupt large-amplitude movement in the cabin',
    },
    [BehaviourSignal.TREMOR_BAND_MOTION]: {
      signal: BehaviourSignal.TREMOR_BAND_MOTION,
      signalClass: MOTION,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 2,
      // Engine vibration and road surface sit in the same frequency band.
      detectorReliability: 0.4,
      halfLifeSeconds: 180,
      minimumConfidence: 0.6,
      minimumDurationSeconds: 10,
      baselineRelative: true,
      description: 'Periodic 4–12 Hz movement above baseline',
    },
    [BehaviourSignal.ABNORMAL_STILLNESS]: {
      signal: BehaviourSignal.ABNORMAL_STILLNESS,
      signalClass: MOTION,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 2,
      detectorReliability: 0.6,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 45,
      baselineRelative: true,
      description: 'An occupant almost motionless for an unusually long period',
    },

    // -------------------------------------------------------------- objects
    [BehaviourSignal.WEAPON_VISIBLE]: {
      signal: BehaviourSignal.WEAPON_VISIBLE,
      signalClass: OBJECT,
      evidenceClass: BEHAVIOURAL,
      // A weapon genuinely visible in a cabin is overwhelmingly diagnostic.
      likelihoodRatio: 80,
      // And the detector is the least trustworthy in the engine, which is the
      // entire point of separating these two axes. Cabin object detectors
      // confuse handguns with phones, wallets and bottles precisely in the
      // conditions that matter — low light, partial occlusion, motion blur, an
      // object held rather than laid flat. AI weapons screening has already
      // been the subject of an FTC enforcement action over accuracy claims.
      //
      // The product of the two is what reaches the score, so a high-confidence
      // weapon detection contributes roughly as much as a door opening at
      // speed. That is the correct relative weighting and it will look wrong to
      // anyone reading only the likelihood ratio.
      detectorReliability: 0.35,
      halfLifeSeconds: 600,
      // The highest confidence floor in the catalogue.
      minimumConfidence: 0.75,
      // Two seconds of tracking. A single-frame weapon detection in a moving
      // cabin is noise; a real one persists across frames.
      minimumDurationSeconds: 2,
      baselineRelative: false,
      description: 'An object classified as a weapon was tracked in the cabin',
    },
    [BehaviourSignal.RESTRAINT_OBJECT_VISIBLE]: {
      signal: BehaviourSignal.RESTRAINT_OBJECT_VISIBLE,
      signalClass: OBJECT,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 15,
      // Cable ties, rope and tape are ordinary cargo in most working vehicles.
      detectorReliability: 0.4,
      halfLifeSeconds: 600,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 4,
      baselineRelative: false,
      description: 'Rope, cable ties or tape visible in the occupant space',
    },

    // --------------------------------------------------------------- vocal
    [BehaviourSignal.DURESS_PHRASE_SPOKEN]: {
      signal: BehaviourSignal.DURESS_PHRASE_SPOKEN,
      signalClass: VOCAL,
      // Testimony, not inference: the driver chose to send this.
      evidenceClass: EXPLICIT,
      likelihoodRatio: 400,
      detectorReliability: 0.85,
      halfLifeSeconds: 1800,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'The driver spoke their enrolled duress phrase',
    },
    [BehaviourSignal.UNEXPECTED_SPEAKER_COUNT]: {
      signal: BehaviourSignal.UNEXPECTED_SPEAKER_COUNT,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 4,
      detectorReliability: 0.55,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 5,
      baselineRelative: false,
      description: 'More distinct speakers than the trip expected',
    },
    [BehaviourSignal.PROLONGED_SILENCE_OCCUPIED]: {
      signal: BehaviourSignal.PROLONGED_SILENCE_OCCUPIED,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 2.5,
      detectorReliability: 0.6,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 90,
      baselineRelative: false,
      description: 'No speech for an implausibly long period in an occupied cabin',
    },
    [BehaviourSignal.RAISED_VOCAL_EFFORT]: {
      signal: BehaviourSignal.RAISED_VOCAL_EFFORT,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      // People shout in cars constantly — at traffic, at children, at
      // hands-free calls. Barely informative on its own.
      likelihoodRatio: 2,
      detectorReliability: 0.65,
      halfLifeSeconds: 120,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 3,
      baselineRelative: true,
      description: 'Sustained vocal effort above this cabin’s baseline',
    },
    [BehaviourSignal.PITCH_ELEVATION]: {
      signal: BehaviourSignal.PITCH_ELEVATION,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 1.8,
      // Prosody is a genuine measurement; what it means is not recoverable.
      detectorReliability: 0.45,
      halfLifeSeconds: 120,
      minimumConfidence: 0.55,
      minimumDurationSeconds: 4,
      baselineRelative: true,
      description: 'Fundamental frequency elevated against the speaker’s baseline',
    },
    [BehaviourSignal.SPEECH_RATE_DEPARTURE]: {
      signal: BehaviourSignal.SPEECH_RATE_DEPARTURE,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 1.5,
      detectorReliability: 0.45,
      halfLifeSeconds: 120,
      minimumConfidence: 0.55,
      minimumDurationSeconds: 5,
      baselineRelative: true,
      description: 'Speaking rate departing sharply from the speaker’s baseline',
    },
    [BehaviourSignal.VOCAL_INSTABILITY]: {
      signal: BehaviourSignal.VOCAL_INSTABILITY,
      signalClass: VOCAL,
      evidenceClass: ACOUSTIC,
      // Jitter and shimmer are measurable. Their link to duress is weak, and
      // the literature on voice stress detection is largely negative.
      likelihoodRatio: 1.6,
      detectorReliability: 0.4,
      halfLifeSeconds: 120,
      minimumConfidence: 0.6,
      minimumDurationSeconds: 5,
      baselineRelative: true,
      description: 'Jitter and shimmer above the speaker’s baseline',
    },

    // ----------------------------------------------------- acoustic events
    [BehaviourSignal.GUNSHOT_DETECTED]: {
      signal: BehaviourSignal.GUNSHOT_DETECTED,
      signalClass: ACOUSTIC_EVENT,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 120,
      // An enclosed cabin is a much easier acoustic problem than the outdoor
      // gunshot-location systems whose accuracy has been publicly contested —
      // the source is metres away and the reverberation is predictable. Still
      // capped well short of certainty: a backfire and a slammed boot lid share
      // much of the same envelope.
      detectorReliability: 0.6,
      halfLifeSeconds: 900,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'A gunshot signature was detected in or beside the cabin',
    },
    [BehaviourSignal.GLASS_BREAK]: {
      signal: BehaviourSignal.GLASS_BREAK,
      signalClass: ACOUSTIC_EVENT,
      evidenceClass: ACOUSTIC,
      likelihoodRatio: 30,
      // A genuinely distinctive high-frequency signature, and the acoustic
      // detection problem the industry has actually solved — domestic alarm
      // sensors have done this reliably for decades.
      detectorReliability: 0.75,
      halfLifeSeconds: 900,
      minimumConfidence: 0.6,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'Breaking glass detected in the cabin',
    },
    [BehaviourSignal.IMPACT_DETECTED]: {
      signal: BehaviourSignal.IMPACT_DETECTED,
      signalClass: ACOUSTIC_EVENT,
      evidenceClass: ACOUSTIC,
      // Collisions are common and mostly not hijackings, though a deliberate
      // bump is a standard technique for stopping a target vehicle.
      likelihoodRatio: 4,
      detectorReliability: 0.7,
      halfLifeSeconds: 600,
      minimumConfidence: 0.6,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'A structural impact was detected',
    },

    // -------------------------------------------------------------- device
    [BehaviourSignal.CAMERA_OBSTRUCTED]: {
      signal: BehaviourSignal.CAMERA_OBSTRUCTED,
      signalClass: DEVICE,
      // Device state, not vision. Classing it with the camera's own
      // observations would let a broken sensor corroborate itself.
      evidenceClass: PHYSICAL,
      likelihoodRatio: 8,
      // The detection is easy — a covered lens is obvious. What is impossible
      // is telling a covered lens from a dirty one, and on Highveld gravel
      // roads the second is a daily occurrence.
      detectorReliability: 0.5,
      halfLifeSeconds: 600,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 10,
      baselineRelative: false,
      description: 'A cabin camera stopped being able to see',
    },

    // --------------------------------------------------------------- cabin
    [BehaviourSignal.RAPID_MULTI_ENTRY]: {
      signal: BehaviourSignal.RAPID_MULTI_ENTRY,
      signalClass: CABIN,
      evidenceClass: BEHAVIOURAL,
      likelihoodRatio: 6,
      detectorReliability: 0.7,
      halfLifeSeconds: 300,
      minimumConfidence: 0.55,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'Several occupants entered within a few seconds',
    },
    [BehaviourSignal.DOOR_OPEN_IN_MOTION]: {
      signal: BehaviourSignal.DOOR_OPEN_IN_MOTION,
      signalClass: CABIN,
      evidenceClass: PHYSICAL,
      likelihoodRatio: 5,
      // A direct vehicle sensor rather than an inference, so trusted highly.
      detectorReliability: 0.9,
      halfLifeSeconds: 240,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 1,
      baselineRelative: false,
      description: 'A door opened above walking pace',
    },
    [BehaviourSignal.BELT_RELEASED_IN_MOTION]: {
      signal: BehaviourSignal.BELT_RELEASED_IN_MOTION,
      signalClass: CABIN,
      evidenceClass: PHYSICAL,
      likelihoodRatio: 3,
      detectorReliability: 0.9,
      halfLifeSeconds: 240,
      minimumConfidence: 0.7,
      minimumDurationSeconds: 1,
      baselineRelative: false,
      description: 'Driver’s seatbelt released above walking pace',
    },
    [BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP]: {
      signal: BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP,
      signalClass: CABIN,
      evidenceClass: BEHAVIOURAL,
      // This is just picking someone up. Included because it is meaningful in
      // combination, and near-worthless alone.
      likelihoodRatio: 1.8,
      detectorReliability: 0.75,
      halfLifeSeconds: 420,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 0,
      baselineRelative: false,
      description: 'Occupant count rose while the vehicle was stopped',
    },

    // ------------------------------------------------------------- control
    [BehaviourSignal.ERRATIC_CONTROL_INPUT]: {
      signal: BehaviourSignal.ERRATIC_CONTROL_INPUT,
      signalClass: CONTROL,
      evidenceClass: PHYSICAL,
      likelihoodRatio: 3,
      detectorReliability: 0.7,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 10,
      baselineRelative: true,
      description: 'Steering and pedal inputs far outside this driver’s baseline',
    },
    [BehaviourSignal.HARSH_MANOEUVRE_BURST]: {
      signal: BehaviourSignal.HARSH_MANOEUVRE_BURST,
      signalClass: CONTROL,
      evidenceClass: PHYSICAL,
      likelihoodRatio: 2.5,
      detectorReliability: 0.8,
      halfLifeSeconds: 240,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 0,
      baselineRelative: true,
      description: 'Several harsh manoeuvres inside a short window',
    },
    [BehaviourSignal.UNCHARACTERISTIC_OVERSPEED]: {
      signal: BehaviourSignal.UNCHARACTERISTIC_OVERSPEED,
      signalClass: CONTROL,
      evidenceClass: PHYSICAL,
      likelihoodRatio: 2,
      detectorReliability: 0.85,
      halfLifeSeconds: 300,
      minimumConfidence: 0.5,
      minimumDurationSeconds: 20,
      baselineRelative: true,
      description: 'Sustained speed far above this driver’s baseline',
    },
  });

/**
 * Cap on how much any single signal may contribute, in log10 likelihood units.
 *
 * log10(20) ≈ 1.3, so no one observation can move the posterior by more than
 * about twenty-fold however confident the detector claims to be. Without this,
 * a stuck detector reporting `HANDS_RAISED` at confidence 1.0 forever would
 * pin every vehicle it watches at SEVERE.
 *
 * The explicit class is exempt, and only that class — a driver deliberately
 * speaking their duress phrase is not an inference to be hedged.
 */
const MAXIMUM_SIGNAL_LOG_LR = 1.3;
const MAXIMUM_EXPLICIT_LOG_LR = 2.7;

/**
 * Effective likelihood ratio for an observation, after every discount.
 *
 * Quality, detector confidence, staleness and a missing baseline all shrink the
 * ratio **toward 1**, not toward 0. That direction matters: LR = 1 means "this
 * observation tells us nothing", whereas LR < 1 would mean "this observation is
 * evidence the driver is *safe*". A blurry camera is the former. Treating a
 * degraded sensor as reassurance is how a monitoring system fails silently at
 * exactly the moment it is needed.
 */
export function effectiveLikelihoodRatio(
  observation: BehaviourObservation,
  ageSeconds: number,
): number {
  const calibration = SIGNAL_CALIBRATION[observation.signal];
  if (!calibration) return 1;

  const decay = signalDecayFactor(observation.signal, ageSeconds);

  /**
   * A **baseline-relative** signal with no baseline is worth roughly half as
   * much. "Louder than usual" requires knowing what usual is; without it the
   * detector is comparing against a population average that may not describe
   * this person at all.
   *
   * Categorical signals are exempt, and the exemption matters more than the
   * rule. There is no personal baseline rate of having a firearm in the cabin,
   * of breaking glass, or of a door opening at 40 km/h. Halving those for a
   * missing baseline would suppress the strongest evidence the engine has —
   * and would do it permanently on any driver who has not yet been profiled,
   * which is exactly the population a new deployment consists of.
   */
  const baselineFactor =
    calibration.baselineRelative && observation.baselineDeviation === null ? 0.5 : 1;

  const shrink =
    calibration.detectorReliability *
    observation.detectorConfidence *
    observation.quality *
    observation.strength *
    decay *
    baselineFactor;

  // Shrink toward 1 (uninformative) rather than toward 0 (exculpatory).
  const effective = 1 + (calibration.likelihoodRatio - 1) * clamp01(shrink);

  const cap =
    calibration.evidenceClass === ThreatEvidenceClass.EXPLICIT
      ? MAXIMUM_EXPLICIT_LOG_LR
      : MAXIMUM_SIGNAL_LOG_LR;

  return Math.min(effective, Math.pow(10, cap));
}

/** Exponential decay on the signal's own half-life. */
export function signalDecayFactor(signal: BehaviourSignal, ageSeconds: number): number {
  if (ageSeconds <= 0) return 1;

  const calibration = SIGNAL_CALIBRATION[signal];
  if (!calibration) return 0;

  return Math.pow(0.5, ageSeconds / calibration.halfLifeSeconds);
}

/** Observations older than eight half-lives carry under 0.4% weight. Dropped. */
export function isObservationExpired(signal: BehaviourSignal, ageSeconds: number): boolean {
  const calibration = SIGNAL_CALIBRATION[signal];
  if (!calibration) return true;

  return ageSeconds > calibration.halfLifeSeconds * 8;
}

/**
 * Whether an observation clears its gates.
 *
 * Returns a reason rather than a boolean so the assessment can record *why* a
 * signal was dropped. "The camera saw nothing" and "the camera saw something
 * for 200 ms and we ignored it" are different facts about a trip.
 */
export function admitObservation(
  observation: BehaviourObservation,
  ageSeconds: number,
): { admitted: true } | { admitted: false; reason: string } {
  const calibration = SIGNAL_CALIBRATION[observation.signal];

  if (!calibration) {
    return { admitted: false, reason: `Unknown signal '${observation.signal}'` };
  }

  if (isObservationExpired(observation.signal, ageSeconds)) {
    return { admitted: false, reason: 'Observation too old to be informative' };
  }

  if (observation.detectorConfidence < calibration.minimumConfidence) {
    return {
      admitted: false,
      reason: `Detector confidence ${observation.detectorConfidence.toFixed(2)} is below the ${calibration.minimumConfidence} threshold`,
    };
  }

  if (observation.durationSeconds < calibration.minimumDurationSeconds) {
    return {
      admitted: false,
      reason: `Lasted ${observation.durationSeconds.toFixed(1)}s, below the ${calibration.minimumDurationSeconds}s minimum — most transients at this scale are road surface or sensor noise`,
    };
  }

  return { admitted: true };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
