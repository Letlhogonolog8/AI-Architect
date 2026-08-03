import {
  BehaviourSignal,
  IdentityBand,
  ThreatHypothesis,
  type BehaviourObservation,
} from '@aegisdrive/types';
import { SIGNAL_CALIBRATION, effectiveLikelihoodRatio } from '../behaviour/catalogue';

/**
 * The likelihood matrix: P(evidence | hypothesis), relative to normal.
 *
 * ## How this stays consistent with the behaviour engine
 *
 * Each cell is a likelihood ratio against `NORMAL`, which is fixed at 1.0 by
 * definition. The **`HIJACKING` column is not restated here** — it is read from
 * `SIGNAL_CALIBRATION[signal].likelihoodRatio`, the same table the Phase 5
 * threat scorer uses.
 *
 * That anchoring is deliberate and load-bearing. Phase 5's likelihood ratio
 * *is* P(signal | hijacking) / P(signal | normal); it is already the hijacking
 * column of this matrix. Restating it would create two sets of constants for
 * one quantity, which is the exact failure ADR-0007 decision 2 exists to
 * prevent. Raise a ratio in the behaviour catalogue and this engine moves with
 * it, automatically.
 *
 * ## Only the interesting cells are written down
 *
 * A full table would be 31 signals × 8 hypotheses = 248 numbers, most of them
 * 1.0, none of them individually reviewable. So the default is 1.0 —
 * uninformative — and only the cells where a signal genuinely discriminates are
 * stated. What is written below is therefore exactly the set of claims this
 * engine makes about what distinguishes one event from another, and it can be
 * read in one sitting.
 *
 * ## The rows that do the real work
 *
 * `SLUMPED_POSTURE` under `MEDICAL`, and `CAMERA_OBSTRUCTED` under
 * `SENSOR_FAILURE`. Between them they are why this engine exists: a single
 * threat axis sends armed responders to a stroke and to a dirty lens, and these
 * two rows are what stop it.
 */

export const LIKELIHOOD_SOURCE = 'structured-estimates-v1' as const;

type HypothesisLikelihoods = Partial<Record<ThreatHypothesis, number>>;

/**
 * Signal likelihoods, relative to `NORMAL` = 1.0.
 *
 * Omitted hypotheses default to 1.0 (the signal says nothing about them).
 * `HIJACKING` is omitted throughout and anchored to the behaviour catalogue;
 * where it *is* stated, the value overrides the anchor and the reason is in a
 * comment.
 */
export const SIGNAL_LIKELIHOODS: Readonly<Partial<Record<BehaviourSignal, HypothesisLikelihoods>>> =
  Object.freeze({
    // ------------------------------------------------------------- posture
    [BehaviourSignal.HANDS_RAISED]: {
      [ThreatHypothesis.DURESS]: 55,
      [ThreatHypothesis.THEFT]: 15,
      // A pose model losing tracking can throw wrists above the shoulders.
      [ThreatHypothesis.SENSOR_FAILURE]: 6,
      [ThreatHypothesis.COLLISION]: 3,
    },
    [BehaviourSignal.WRISTS_CONSTRAINED]: {
      [ThreatHypothesis.DURESS]: 45,
      [ThreatHypothesis.THEFT]: 8,
      [ThreatHypothesis.SENSOR_FAILURE]: 5,
    },
    [BehaviourSignal.DRIVER_POSITION_VACATED]: {
      // The defining observation of a theft: the vehicle is moving, the enrolled
      // driver is not in it.
      [ThreatHypothesis.THEFT]: 45,
      // And the defining observation of a camera that has stopped working. These
      // two are genuinely hard to separate from vision alone, which is why the
      // number is this high and why the engine leans on corroboration.
      [ThreatHypothesis.SENSOR_FAILURE]: 35,
      [ThreatHypothesis.MEDICAL]: 8,
      [ThreatHypothesis.COLLISION]: 6,
    },
    [BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER]: {
      [ThreatHypothesis.DURESS]: 14,
      [ThreatHypothesis.MEDICAL]: 6,
      [ThreatHypothesis.SENSOR_FAILURE]: 3,
    },
    [BehaviourSignal.TORSO_TURNED_SUSTAINED]: {
      [ThreatHypothesis.DURESS]: 4,
      [ThreatHypothesis.MEDICAL]: 3,
    },
    [BehaviourSignal.SLUMPED_POSTURE]: {
      // The row this engine was built for.
      //
      // Phase 5 gives slumping a hijacking ratio of 3 — mildly suspicious. Under
      // MEDICAL it is 45, and under COLLISION 30. A slumped driver with erratic
      // steering and a silent cabin resolves to a medical emergency and an
      // ambulance, where a single threat axis resolved it to an elevated threat
      // and armed responders.
      [ThreatHypothesis.MEDICAL]: 45,
      [ThreatHypothesis.COLLISION]: 30,
      [ThreatHypothesis.DURESS]: 3,
      [ThreatHypothesis.SENSOR_FAILURE]: 4,
    },
    [BehaviourSignal.HANDS_OFF_WHEEL_MOVING]: {
      [ThreatHypothesis.MEDICAL]: 12,
      [ThreatHypothesis.DURESS]: 4,
      [ThreatHypothesis.COLLISION]: 5,
    },

    // -------------------------------------------------------------- objects
    [BehaviourSignal.WEAPON_VISIBLE]: {
      [ThreatHypothesis.DURESS]: 70,
      [ThreatHypothesis.THEFT]: 25,
      // Object detectors hallucinate on degraded frames, and the weapon class is
      // where they hallucinate most consequentially.
      [ThreatHypothesis.SENSOR_FAILURE]: 8,
      // Deliberately not raised for UNAUTHORISED_USE. A colleague borrowing the
      // bakkie is not more likely to be armed, and implying otherwise would make
      // the engine treat unfamiliar drivers as dangerous.
    },
    [BehaviourSignal.RESTRAINT_OBJECT_VISIBLE]: {
      [ThreatHypothesis.DURESS]: 18,
      [ThreatHypothesis.SENSOR_FAILURE]: 4,
    },

    // --------------------------------------------------------------- motion
    [BehaviourSignal.ELEVATED_MOTION_ENERGY]: {
      [ThreatHypothesis.DURESS]: 3,
      [ThreatHypothesis.COLLISION]: 4,
      [ThreatHypothesis.MEDICAL]: 3,
    },
    [BehaviourSignal.SUDDEN_MOTION_BURST]: {
      [ThreatHypothesis.COLLISION]: 20,
      [ThreatHypothesis.DURESS]: 3,
    },
    [BehaviourSignal.TREMOR_BAND_MOTION]: {
      [ThreatHypothesis.MEDICAL]: 8,
      [ThreatHypothesis.DURESS]: 3,
      // Engine vibration and road surface live in the same frequency band.
      [ThreatHypothesis.SENSOR_FAILURE]: 6,
    },
    [BehaviourSignal.ABNORMAL_STILLNESS]: {
      [ThreatHypothesis.MEDICAL]: 20,
      [ThreatHypothesis.DURESS]: 6,
      [ThreatHypothesis.SENSOR_FAILURE]: 10,
    },

    // ---------------------------------------------------------------- vocal
    [BehaviourSignal.DURESS_PHRASE_SPOKEN]: {
      // Testimony. The driver is present and is telling the system so.
      [ThreatHypothesis.DURESS]: 400,
      // Near-zero: the phrase cannot be spoken by a driver who is not there.
      [ThreatHypothesis.THEFT]: 0.05,
      [ThreatHypothesis.SENSOR_FAILURE]: 0.5,
      [ThreatHypothesis.MEDICAL]: 0.5,
    },
    [BehaviourSignal.UNEXPECTED_SPEAKER_COUNT]: {
      [ThreatHypothesis.DURESS]: 5,
      [ThreatHypothesis.UNAUTHORISED_USE]: 3,
      [ThreatHypothesis.SENSOR_FAILURE]: 3,
    },
    [BehaviourSignal.PROLONGED_SILENCE_OCCUPIED]: {
      [ThreatHypothesis.MEDICAL]: 8,
      [ThreatHypothesis.DURESS]: 4,
      // A dead microphone produces perfect silence.
      [ThreatHypothesis.SENSOR_FAILURE]: 12,
    },
    [BehaviourSignal.RAISED_VOCAL_EFFORT]: {
      [ThreatHypothesis.DURESS]: 2.5,
      [ThreatHypothesis.COLLISION]: 4,
    },
    [BehaviourSignal.PITCH_ELEVATION]: {
      [ThreatHypothesis.DURESS]: 2,
      [ThreatHypothesis.MEDICAL]: 2,
    },
    [BehaviourSignal.SPEECH_RATE_DEPARTURE]: {
      [ThreatHypothesis.MEDICAL]: 3,
      [ThreatHypothesis.DURESS]: 1.6,
    },
    [BehaviourSignal.VOCAL_INSTABILITY]: {
      [ThreatHypothesis.MEDICAL]: 3,
      [ThreatHypothesis.DURESS]: 1.8,
    },

    // ------------------------------------------------------ acoustic events
    [BehaviourSignal.GLASS_BREAK]: {
      [ThreatHypothesis.THEFT]: 40,
      [ThreatHypothesis.COLLISION]: 25,
      [ThreatHypothesis.DURESS]: 10,
      [ThreatHypothesis.SENSOR_FAILURE]: 3,
    },
    [BehaviourSignal.IMPACT_DETECTED]: {
      // A collision is by far the likeliest cause of an impact, and a deliberate
      // bump to stop a target vehicle is a real but much rarer technique.
      [ThreatHypothesis.COLLISION]: 70,
      [ThreatHypothesis.THEFT]: 3,
      [ThreatHypothesis.SENSOR_FAILURE]: 4,
    },
    [BehaviourSignal.GUNSHOT_DETECTED]: {
      [ThreatHypothesis.DURESS]: 100,
      [ThreatHypothesis.THEFT]: 40,
      [ThreatHypothesis.SENSOR_FAILURE]: 8,
    },

    // --------------------------------------------------------------- device
    [BehaviourSignal.CAMERA_OBSTRUCTED]: {
      // The other row this engine was built for.
      //
      // A covered lens is overwhelmingly a dirty lens. Giving sensor failure a
      // ratio well above every threat hypothesis is what lets the engine say "the
      // camera has stopped working" instead of reaching for an explanation
      // involving people.
      [ThreatHypothesis.SENSOR_FAILURE]: 90,
      [ThreatHypothesis.THEFT]: 6,
      [ThreatHypothesis.DURESS]: 5,
    },

    // ---------------------------------------------------------------- cabin
    [BehaviourSignal.RAPID_MULTI_ENTRY]: {
      [ThreatHypothesis.DURESS]: 8,
      [ThreatHypothesis.UNAUTHORISED_USE]: 3,
    },
    [BehaviourSignal.DOOR_OPEN_IN_MOTION]: {
      [ThreatHypothesis.THEFT]: 8,
      [ThreatHypothesis.COLLISION]: 12,
      [ThreatHypothesis.DURESS]: 5,
    },
    [BehaviourSignal.BELT_RELEASED_IN_MOTION]: {
      [ThreatHypothesis.MEDICAL]: 6,
      [ThreatHypothesis.DURESS]: 4,
      [ThreatHypothesis.THEFT]: 4,
    },
    [BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP]: {
      [ThreatHypothesis.DURESS]: 2.5,
      [ThreatHypothesis.UNAUTHORISED_USE]: 2,
    },

    // -------------------------------------------------------------- control
    [BehaviourSignal.ERRATIC_CONTROL_INPUT]: {
      // Erratic steering is far more diagnostic of an incapacitated driver than
      // of a hijacking — a hijacker generally wants to drive competently away.
      [ThreatHypothesis.MEDICAL]: 25,
      [ThreatHypothesis.COLLISION]: 10,
      [ThreatHypothesis.UNAUTHORISED_USE]: 4,
      [ThreatHypothesis.DURESS]: 3,
    },
    [BehaviourSignal.HARSH_MANOEUVRE_BURST]: {
      [ThreatHypothesis.MEDICAL]: 6,
      [ThreatHypothesis.COLLISION]: 8,
      [ThreatHypothesis.UNAUTHORISED_USE]: 3,
    },
    [BehaviourSignal.UNCHARACTERISTIC_OVERSPEED]: {
      [ThreatHypothesis.THEFT]: 6,
      [ThreatHypothesis.UNAUTHORISED_USE]: 5,
      [ThreatHypothesis.MEDICAL]: 3,
    },
  });

/**
 * Identity band likelihoods.
 *
 * The important row is `IMPOSTOR`. It is far more diagnostic of a colleague
 * driving the bakkie than of anything criminal, because colleagues borrowing
 * vehicles is a daily occurrence and vehicle theft is not. The engine reflects
 * that: an unrecognised driver on a normal route with a calm cabin resolves to
 * `UNAUTHORISED_USE`, not to a threat.
 *
 * `VERIFIED` is only mildly exculpatory against the coercion hypotheses, for
 * the reason set out in the behaviour engine: in a hijacking the driver is
 * usually still in the car. That is what makes it a hijacking.
 */
export const IDENTITY_LIKELIHOODS: Readonly<Record<IdentityBand, HypothesisLikelihoods>> =
  Object.freeze({
    [IdentityBand.VERIFIED]: {
      [ThreatHypothesis.THEFT]: 0.1,
      [ThreatHypothesis.UNAUTHORISED_USE]: 0.05,
      // Barely lowered: a verified face says nothing about whether there is a gun
      // against the ribs below it.
      [ThreatHypothesis.HIJACKING]: 0.8,
      [ThreatHypothesis.DURESS]: 0.8,
    },
    [IdentityBand.PROBABLE]: {
      [ThreatHypothesis.THEFT]: 0.3,
      [ThreatHypothesis.UNAUTHORISED_USE]: 0.3,
      [ThreatHypothesis.HIJACKING]: 0.9,
      [ThreatHypothesis.DURESS]: 0.9,
    },
    [IdentityBand.UNCERTAIN]: {
      // Uncertainty is usually a dark cabin, not a stranger.
      [ThreatHypothesis.SENSOR_FAILURE]: 4,
    },
    [IdentityBand.SUSPECT]: {
      [ThreatHypothesis.UNAUTHORISED_USE]: 12,
      [ThreatHypothesis.THEFT]: 6,
      [ThreatHypothesis.HIJACKING]: 3,
      [ThreatHypothesis.SENSOR_FAILURE]: 3,
    },
    [IdentityBand.IMPOSTOR]: {
      // The dominant explanation for an unrecognised driver, by a wide margin.
      [ThreatHypothesis.UNAUTHORISED_USE]: 60,
      [ThreatHypothesis.THEFT]: 30,
      // Lower than theft: in a hijacking the enrolled driver is usually still
      // present, so a confident impostor reading argues mildly *against* it.
      [ThreatHypothesis.HIJACKING]: 8,
      [ThreatHypothesis.DURESS]: 2,
      [ThreatHypothesis.SENSOR_FAILURE]: 5,
    },
  });

/**
 * Likelihood of an observation under one hypothesis, relative to normal.
 *
 * The hijacking column is read from the behaviour catalogue and shares its
 * shrinkage — quality, detector reliability, persistence and staleness all pull
 * it toward 1. Other hypotheses get the same shrinkage applied to their own
 * ratio, so a degraded observation is uninformative about *every* hypothesis
 * rather than only about hijacking.
 */
export function likelihoodFor(
  observation: BehaviourObservation,
  hypothesis: ThreatHypothesis,
  ageSeconds: number,
): number {
  if (hypothesis === ThreatHypothesis.NORMAL) return 1;

  const calibration = SIGNAL_CALIBRATION[observation.signal];
  if (!calibration) return 1;

  // The hijacking column, already shrunk for quality and staleness.
  const shrunkHijacking = effectiveLikelihoodRatio(observation, ageSeconds);

  if (hypothesis === ThreatHypothesis.HIJACKING) return shrunkHijacking;

  const stated = SIGNAL_LIKELIHOODS[observation.signal]?.[hypothesis];
  if (stated === undefined) return 1;

  // Recover the shrink factor the behaviour engine applied, and apply the same
  // proportion to this hypothesis' ratio. Deriving it rather than recomputing
  // it keeps one definition of "how much do we trust this observation".
  const rawHijacking = calibration.likelihoodRatio;
  const shrink = rawHijacking > 1 ? (shrunkHijacking - 1) / (rawHijacking - 1) : 0;

  const clampedShrink = Math.min(1, Math.max(0, shrink));

  // Ratios below 1 are exculpatory and shrink toward 1 from below, which is the
  // same operation — a degraded observation should not exonerate either.
  return 1 + (stated - 1) * clampedShrink;
}

/** Identity likelihood, shrunk by the assessment's own confidence. */
export function identityLikelihoodFor(
  band: IdentityBand,
  hypothesis: ThreatHypothesis,
  confidence: number,
): number {
  if (hypothesis === ThreatHypothesis.NORMAL) return 1;

  const stated = IDENTITY_LIKELIHOODS[band]?.[hypothesis];
  if (stated === undefined) return 1;

  const shrink = Math.min(1, Math.max(0, confidence));
  return 1 + (stated - 1) * shrink;
}
