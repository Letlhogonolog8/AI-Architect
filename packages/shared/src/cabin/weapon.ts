import {
  DetectedObjectClass,
  WEAPON_CLASSES,
  type ObjectDetection,
  type WeaponAssessment,
} from '@aegisdrive/types';

/**
 * Weapon assessment.
 *
 * Turns a candidate weapon detection into something an operator can act on
 * *carefully*, which means reporting the detection alongside everything that
 * argues against it.
 *
 * ## Why this file is so unwilling to commit
 *
 * A false weapon detection here sends armed responders to an innocent person.
 * It is the highest-consequence output the platform can produce, and the
 * deployed track record of the technology does not support confidence:
 * AI weapons screening has been the subject of an FTC enforcement action over
 * accuracy claims, and cabin-scale object detection confuses handguns with
 * phones, wallets and bottles precisely in the conditions that matter — low
 * light, partial occlusion, motion blur, an object held rather than laid flat.
 *
 * The failure is asymmetric in a way that decides the design. A missed weapon
 * costs the system a corroborating signal, and the other five evidence classes
 * are still watching. A false weapon call costs a citizen an armed
 * confrontation. There is no symmetric threshold that trades those off, so the
 * engine does not try to find one: it reports, it caveats, and it requires a
 * human to look.
 *
 * ## The two numbers, again
 *
 * Same discipline as `ThreatScore`: `candidate.confidence` is what the detector
 * said, `positivePredictiveValue` is how often a detector saying that is right,
 * given how rare weapons actually are in a cabin. They differ by two orders of
 * magnitude, and displaying the first without the second is how an operator
 * ends up certain about a mobile phone.
 */

export const WEAPON_POLICY_VERSION = 'weapon-v1' as const;

/**
 * Weapon-visible hours per cabin-hour, absent a fleet-specific figure.
 *
 * Deliberately low, and **deliberately the wrong number for many fleets.** A
 * cash-in-transit crew is armed by design and its true rate is near 1; a
 * suburban delivery fleet's is far below this default. Configure it per
 * operating profile, because the same detection means opposite things across
 * the two and the PPV is meaningless if this is left unexamined.
 */
export const DEFAULT_WEAPON_BASE_RATE_PER_CABIN_HOUR = 1e-4;

/**
 * Maximum likelihood ratio a clean weapon detection can carry.
 *
 * Matches `WEAPON_VISIBLE` in the behaviour catalogue so the two cannot drift:
 * a weapon genuinely visible in a cabin is overwhelmingly diagnostic, and the
 * detector telling you one is there is a much weaker claim than that.
 */
const MAXIMUM_WEAPON_LIKELIHOOD_RATIO = 80;

/**
 * How much to trust a cabin weapon detector. The lowest figure in the platform.
 *
 * Kept identical to `SIGNAL_CALIBRATION[WEAPON_VISIBLE].detectorReliability`.
 * If one is raised without the other, the score and the PPV start telling an
 * operator two different stories about the same pixels.
 */
const WEAPON_DETECTOR_RELIABILITY = 0.35;

/** Below this the detection is not reported at all. Highest floor in the engine. */
export const WEAPON_REPORTING_FLOOR = 0.75;

/** Seconds a candidate must be tracked before it is reported. */
export const WEAPON_MINIMUM_PERSISTENCE_SECONDS = 2;

export interface WeaponAssessmentInput {
  /** Every object the detector returned for the window. */
  detections: readonly ObjectDetection[];
  /**
   * Non-vision evidence already indicating a threat, e.g. `GLASS_BREAK`,
   * `PANIC_BUTTON`, `IDENTITY_IMPOSTOR`. Sources from the same camera do not
   * count and must not be passed here.
   */
  corroboratingSources?: readonly string[];
  baseRatePerCabinHour?: number;
  now?: Date;
}

export function assessWeapon(input: WeaponAssessmentInput): WeaponAssessment {
  const now = input.now ?? new Date();
  const baseRate = input.baseRatePerCabinHour ?? DEFAULT_WEAPON_BASE_RATE_PER_CABIN_HOUR;
  const corroborating = [...(input.corroboratingSources ?? [])];

  const candidate = selectCandidate(input.detections);

  if (!candidate) {
    return {
      candidate: null,
      positivePredictiveValue: 0,
      baseRatePerCabinHour: baseRate,
      corroborated: corroborating.length > 0,
      corroboratingSources: corroborating,
      caveats: [],
      requiresHumanConfirmation: true,
      humanVerdict: null,
      verifiedByUserId: null,
      verifiedAt: null,
      modelId: WEAPON_POLICY_VERSION,
      assessedAt: now.toISOString(),
    };
  }

  const discrimination = discriminationAgainstAlternatives(candidate);
  const persistence = persistenceFactor(candidate);

  // Same shrink-toward-uninformative construction as the behaviour catalogue:
  // poor quality, weak persistence and a crowded ambiguity set all pull the
  // likelihood ratio toward 1, never below it. A blurry frame is absence of
  // evidence, not evidence that the object is harmless.
  const shrink = clamp01(
    candidate.confidence *
      WEAPON_DETECTOR_RELIABILITY *
      candidate.frameQuality *
      persistence *
      discrimination,
  );

  const likelihoodRatio = 1 + (MAXIMUM_WEAPON_LIKELIHOOD_RATIO - 1) * shrink;

  return {
    candidate,
    positivePredictiveValue: posterior(baseRate, likelihoodRatio),
    baseRatePerCabinHour: baseRate,
    corroborated: corroborating.length > 0,
    corroboratingSources: corroborating,
    caveats: buildCaveats(candidate, discrimination, corroborating),
    requiresHumanConfirmation: true,
    humanVerdict: null,
    verifiedByUserId: null,
    verifiedAt: null,
    modelId: WEAPON_POLICY_VERSION,
    assessedAt: now.toISOString(),
  };
}

/**
 * Picks the strongest weapon-class detection that clears both gates.
 *
 * Both gates, not either: a very confident single-frame detection and a
 * long-tracked marginal one are both rejected. Real weapons in a cabin are
 * confidently detected *and* persist; anything satisfying only one condition is
 * far more likely to be a phone catching the light.
 */
function selectCandidate(detections: readonly ObjectDetection[]): ObjectDetection | null {
  const candidates = detections
    .filter((detection) => WEAPON_CLASSES.includes(detection.objectClass))
    .filter((detection) => detection.confidence >= WEAPON_REPORTING_FLOOR)
    .filter((detection) => detection.persistenceSeconds >= WEAPON_MINIMUM_PERSISTENCE_SECONDS)
    .sort((a, b) => b.confidence - a.confidence);

  return candidates[0] ?? null;
}

/**
 * How cleanly the candidate beat its non-weapon alternatives.
 *
 * Returns 1 when nothing else was in contention and falls toward 0 as the
 * confusables gain mass. This is what the ambiguity set is *for*: a detector
 * choosing between a handgun at 0.8 and a phone at 0.7 has told you it does not
 * know, and the arithmetic should carry that rather than reading the argmax and
 * discarding the rest.
 *
 * Only non-weapon alternatives count. A detector torn between a handgun and a
 * knife is confident there is a weapon; which one is a question for the
 * operator looking at the frames.
 */
function discriminationAgainstAlternatives(candidate: ObjectDetection): number {
  const competing = candidate.alternatives
    .filter((alternative) => !WEAPON_CLASSES.includes(alternative.objectClass))
    .reduce((total, alternative) => total + alternative.confidence, 0);

  if (competing <= 0) return 1;

  return candidate.confidence / (candidate.confidence + competing);
}

/** Ramps from 0 at the persistence floor to 1 at four times it. */
function persistenceFactor(candidate: ObjectDetection): number {
  const floor = WEAPON_MINIMUM_PERSISTENCE_SECONDS;
  const saturation = floor * 4;

  if (candidate.persistenceSeconds <= floor) return 0.25;
  if (candidate.persistenceSeconds >= saturation) return 1;

  return 0.25 + (0.75 * (candidate.persistenceSeconds - floor)) / (saturation - floor);
}

/**
 * Everything that argues against the detection.
 *
 * Always non-empty when a candidate exists. An operator who sees a weapon
 * detection with no caveats will read it as certainty, so the absence of doubt
 * is never an option this function can produce.
 */
function buildCaveats(
  candidate: ObjectDetection,
  discrimination: number,
  corroborating: readonly string[],
): string[] {
  const caveats: string[] = [];

  const confusables = candidate.alternatives.filter(
    (alternative) => !WEAPON_CLASSES.includes(alternative.objectClass),
  );

  if (confusables.length > 0) {
    const rendered = confusables
      .map(
        (alternative) =>
          `${humaniseClass(alternative.objectClass)} (${(alternative.confidence * 100).toFixed(0)}%)`,
      )
      .join(', ');

    caveats.push(
      `The detector also considered: ${rendered}. Cabin object detectors confuse handguns with phones, wallets and bottles routinely.`,
    );
  }

  if (discrimination < 0.7) {
    caveats.push(
      'The alternatives carry comparable confidence to the candidate — the detector has not clearly separated them.',
    );
  }

  if (candidate.frameQuality < 0.6) {
    caveats.push(
      `Frame quality was ${candidate.frameQuality.toFixed(2)}. Low light, motion blur and partial occlusion are the conditions in which this detector performs worst.`,
    );
  }

  if (candidate.persistenceSeconds < WEAPON_MINIMUM_PERSISTENCE_SECONDS * 2) {
    caveats.push(
      `Tracked for only ${candidate.persistenceSeconds.toFixed(1)}s. Brief detections in a moving cabin are frequently spurious.`,
    );
  }

  if (corroborating.length === 0) {
    caveats.push(
      'No sensor other than this camera indicates a threat. A weapon detection alone is not grounds for an armed response.',
    );
  }

  caveats.push(
    'This is a reason to review the footage, not a finding of fact. Confirm visually before acting.',
  );

  return caveats;
}

/** Posterior probability from a base rate and a likelihood ratio. */
function posterior(baseRate: number, likelihoodRatio: number): number {
  const prior = Math.min(0.9, Math.max(1e-9, baseRate));
  const priorOdds = prior / (1 - prior);
  const posteriorOdds = priorOdds * likelihoodRatio;

  return Math.round((posteriorOdds / (1 + posteriorOdds)) * 10000) / 10000;
}

export function humaniseClass(objectClass: DetectedObjectClass): string {
  const labels: Partial<Record<DetectedObjectClass, string>> = {
    [DetectedObjectClass.HANDGUN]: 'handgun',
    [DetectedObjectClass.LONG_GUN]: 'long gun',
    [DetectedObjectClass.KNIFE]: 'knife',
    [DetectedObjectClass.BLUNT_WEAPON]: 'blunt weapon',
    [DetectedObjectClass.ROPE_OR_STRAP]: 'rope or strap',
    [DetectedObjectClass.CABLE_TIE]: 'cable tie',
    [DetectedObjectClass.ADHESIVE_TAPE]: 'adhesive tape',
    [DetectedObjectClass.PHONE]: 'mobile phone',
    [DetectedObjectClass.WALLET]: 'wallet',
    [DetectedObjectClass.BOTTLE]: 'bottle',
    [DetectedObjectClass.TOOL]: 'tool',
    [DetectedObjectClass.KEYS]: 'keys',
    [DetectedObjectClass.REMOTE_CONTROL]: 'remote control',
    [DetectedObjectClass.UNKNOWN_OBJECT]: 'unidentified object',
  };

  return labels[objectClass] ?? objectClass.toLowerCase().replace(/_/g, ' ');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
