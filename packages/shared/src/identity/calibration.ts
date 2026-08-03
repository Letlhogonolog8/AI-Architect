import { IdentityModality } from '@aegisdrive/types';

/**
 * Score calibration.
 *
 * ## Why raw scores cannot simply be averaged
 *
 * A face model's 0.8 and a behaviour model's 0.8 are not the same claim. They
 * come from different score distributions with different separations between
 * genuine and impostor populations. Averaging them produces a number that means
 * nothing, and worse, one that *looks* meaningful.
 *
 * Calibration maps each modality's raw score onto a **log-likelihood ratio**:
 *
 *     LLR = log( P(score | genuine) / P(score | impostor) )
 *
 * LLRs are commensurable by construction and additive under independence, which
 * is exactly what fusion needs. LLR = 0 means the observation is uninformative;
 * positive supports the claimed identity, negative contradicts it.
 *
 * ## Where these numbers come from
 *
 * A two-parameter logistic fit on a held-out validation set:
 *
 *     LLR = slope * (score - midpoint)
 *
 * `midpoint` is the score at which genuine and impostor are equally likely —
 * the equal-error point. `slope` is how sharply the two populations separate;
 * a discriminative modality has a steep slope.
 *
 * **The values below are placeholders derived from published benchmark
 * characteristics, not from AEGISDRIVE's own data.** They must be refitted on
 * real enrolment data before production, per deployment population, and
 * re-validated for demographic parity. `calibrationSource` records which is in
 * force so an assessment can never be silently made against unfitted numbers.
 */

export interface ModalityCalibration {
  modality: IdentityModality;
  /** Score at which genuine and impostor hypotheses are equally likely. */
  midpoint: number;
  /** Separation sharpness. Higher means more discriminative. */
  slope: number;
  /**
   * Half-life in seconds. How long an observation stays fully informative.
   *
   * This is where the modalities differ most, and it is a physical-security
   * argument rather than a statistical one: a face seen 30 seconds ago is
   * excellent evidence about who is driving *now*; a face seen 20 minutes ago
   * is not, because a driver swap takes under a minute. A device fingerprint
   * decays slowly — phones do not change hands mid-trip nearly as easily.
   */
  halfLifeSeconds: number;
  /** Below this quality the observation is discarded rather than downweighted. */
  minimumQuality: number;
  /**
   * Cap on the absolute LLR any single modality may contribute.
   *
   * Prevents one confident modality from dominating the fusion. Without it, a
   * face model returning 0.99 would swamp four contradicting signals — which is
   * precisely the failure mode a presentation attack produces.
   */
  maximumAbsoluteLlr: number;
}

export const CALIBRATION_SOURCE = 'benchmark-defaults-v1' as const;

export const MODALITY_CALIBRATION: Readonly<Record<IdentityModality, ModalityCalibration>> =
  Object.freeze({
    [IdentityModality.FACE]: {
      modality: IdentityModality.FACE,
      midpoint: 0.62,
      slope: 14,
      // Two minutes: a driver swap at a traffic light takes well under one.
      halfLifeSeconds: 120,
      minimumQuality: 0.35,
      maximumAbsoluteLlr: 4.0,
    },
    [IdentityModality.VOICE]: {
      modality: IdentityModality.VOICE,
      midpoint: 0.58,
      slope: 9,
      halfLifeSeconds: 180,
      // Cabin noise makes low-quality voice samples common and near-worthless.
      minimumQuality: 0.4,
      maximumAbsoluteLlr: 3.0,
    },
    [IdentityModality.DEVICE]: {
      modality: IdentityModality.DEVICE,
      midpoint: 0.5,
      // Near-binary: a fingerprint matches or it does not.
      slope: 22,
      // Six hours. The phone is physically present and does not change hands.
      halfLifeSeconds: 21_600,
      minimumQuality: 0.0,
      // Capped low despite being reliable: a stolen phone matches perfectly,
      // so device presence must never be sufficient on its own.
      maximumAbsoluteLlr: 2.5,
    },
    [IdentityModality.BEHAVIOUR]: {
      modality: IdentityModality.BEHAVIOUR,
      midpoint: 0.55,
      // Weakly discriminative. Driving style overlaps heavily between people.
      slope: 5,
      halfLifeSeconds: 900,
      minimumQuality: 0.5,
      maximumAbsoluteLlr: 1.5,
    },
    [IdentityModality.INTERACTION]: {
      modality: IdentityModality.INTERACTION,
      midpoint: 0.55,
      slope: 6,
      halfLifeSeconds: 600,
      minimumQuality: 0.5,
      maximumAbsoluteLlr: 1.5,
    },
    [IdentityModality.EXPLICIT]: {
      modality: IdentityModality.EXPLICIT,
      midpoint: 0.5,
      slope: 30,
      // Thirty minutes. A deliberate PIN entry is strong but goes stale: it
      // proves who was there then, not who is there now.
      halfLifeSeconds: 1_800,
      minimumQuality: 0.0,
      maximumAbsoluteLlr: 3.5,
    },
  });

/**
 * Maps a raw score to a calibrated log-likelihood ratio.
 *
 * Clamped to `maximumAbsoluteLlr` so no single modality can dominate.
 */
export function toLogLikelihoodRatio(modality: IdentityModality, score: number): number {
  const calibration = MODALITY_CALIBRATION[modality];
  const clampedScore = Math.min(1, Math.max(0, score));

  const llr = calibration.slope * (clampedScore - calibration.midpoint);

  return Math.min(calibration.maximumAbsoluteLlr, Math.max(-calibration.maximumAbsoluteLlr, llr));
}

/**
 * Temporal decay factor in [0, 1].
 *
 * Exponential with the modality's half-life. Applied as a weight rather than to
 * the LLR directly, so a stale observation becomes *uninformative* (weight → 0)
 * rather than *contradictory* — an old face sighting is not evidence against
 * the driver, it is simply no longer evidence.
 */
export function decayFactor(modality: IdentityModality, ageSeconds: number): number {
  if (ageSeconds <= 0) return 1;

  const { halfLifeSeconds } = MODALITY_CALIBRATION[modality];
  return Math.pow(0.5, ageSeconds / halfLifeSeconds);
}

/** Observations older than this are dropped entirely. */
export function isExpired(modality: IdentityModality, ageSeconds: number): boolean {
  // Eight half-lives leaves under 0.4% weight — below the noise floor.
  return ageSeconds > MODALITY_CALIBRATION[modality].halfLifeSeconds * 8;
}
