import {
  IdentityBand,
  IdentityModality,
  type ModalityContribution,
  type ModalityObservation,
  type OccupancyAssessment,
} from '@aegisdrive/types';
import { decayFactor, isExpired, toLogLikelihoodRatio, MODALITY_CALIBRATION } from './calibration';

/**
 * Multi-factor identity fusion.
 *
 * Combines per-modality observations into a single driver confidence score.
 *
 * ## The model
 *
 * Under conditional independence, log-likelihood ratios add:
 *
 *     LLR_total = log(prior odds) + Σ  w_i · LLR_i
 *     P(genuine | evidence) = sigmoid(LLR_total)
 *
 * where `w_i = quality_i × decay_i`. Quality downweights a poor sample; decay
 * downweights an old one. Both drive the weight toward zero rather than making
 * the contribution negative, because a bad or stale observation is *absence of
 * evidence*, not evidence of absence.
 *
 * ## Where the model is wrong, and what is done about it
 *
 * The independence assumption is false. Face and voice both degrade in the same
 * conditions — a struggle in the cabin corrupts both at once — so their errors
 * correlate and naive addition overstates confidence. Two mitigations:
 *
 *   1. **Per-modality LLR caps** (in `calibration.ts`), so no single signal can
 *      dominate the sum.
 *   2. **A correlation discount** applied when several biometric modalities
 *      agree strongly, since their agreement carries less independent
 *      information than the arithmetic implies.
 *
 * This is a deliberate, documented approximation. A full covariance model needs
 * real joint-distribution data the platform does not have yet; the discount is
 * conservative in the right direction — it lowers confidence rather than
 * raising it.
 */

export const FUSION_POLICY_VERSION = 'fusion-v1' as const;

/**
 * Prior odds that the person driving is the enrolled driver, before evidence.
 *
 * Deliberately high. The overwhelming majority of the time, the driver is who
 * they should be, and a neutral prior would produce a stream of low-confidence
 * assessments on perfectly normal trips — which trains operators to ignore the
 * signal entirely. Hijackings are rare; the maths should say so.
 *
 * log(0.995 / 0.005) ≈ 5.29
 */
const PRIOR_LOG_ODDS = Math.log(0.995 / 0.005);

/**
 * Discount applied per additional strongly-agreeing biometric modality.
 *
 * Face and voice agreeing is worth less than twice one of them agreeing,
 * because their errors correlate.
 */
const CORRELATION_DISCOUNT = 0.75;

export interface FusionInput {
  observations: readonly ModalityObservation[];
  /** Assessment time. Injectable so a replay reproduces the original result exactly. */
  now?: Date;
  occupancy?: OccupancyAssessment | null;
}

export interface FusionResult {
  confidence: number;
  band: IdentityBand;
  fusedLogLikelihoodRatio: number;
  contributions: ModalityContribution[];
  missingModalities: Array<{ modality: IdentityModality; reason: string }>;
  spoofDetected: boolean;
  policyVersion: string;
}

const ALL_MODALITIES: readonly IdentityModality[] = [
  IdentityModality.FACE,
  IdentityModality.VOICE,
  IdentityModality.DEVICE,
  IdentityModality.BEHAVIOUR,
  IdentityModality.INTERACTION,
  IdentityModality.EXPLICIT,
];

export function fuseIdentity(input: FusionInput): FusionResult {
  const now = input.now ?? new Date();
  const contributions: ModalityContribution[] = [];
  const missing: Array<{ modality: IdentityModality; reason: string }> = [];
  const seen = new Set<IdentityModality>();

  let spoofDetected = false;

  // Only the most recent observation per modality is used. Older ones are
  // superseded, not accumulated — three face sightings of the same person in a
  // minute are one piece of evidence, not three.
  const newestPerModality = selectNewest(input.observations);

  for (const observation of newestPerModality) {
    seen.add(observation.modality);

    if (observation.spoofDetected) {
      spoofDetected = true;
      // A detected presentation attack is not a low score to be weighed — it is
      // an attack. The score is discarded and the band forced below.
      contributions.push({
        modality: observation.modality,
        logLikelihoodRatio: 0,
        weight: 0,
        contribution: 0,
        ageSeconds: ageInSeconds(observation.capturedAt, now),
        score: observation.score,
        quality: observation.quality,
      });
      continue;
    }

    const calibration = MODALITY_CALIBRATION[observation.modality];
    const ageSeconds = ageInSeconds(observation.capturedAt, now);

    if (isExpired(observation.modality, ageSeconds)) {
      missing.push({
        modality: observation.modality,
        reason: 'Observation too old to be informative',
      });
      continue;
    }

    if (observation.quality < calibration.minimumQuality) {
      missing.push({
        modality: observation.modality,
        reason: `Sample quality ${observation.quality.toFixed(2)} is below the ${calibration.minimumQuality} threshold`,
      });
      continue;
    }

    const llr = toLogLikelihoodRatio(observation.modality, observation.score);
    const weight = observation.quality * decayFactor(observation.modality, ageSeconds);

    contributions.push({
      modality: observation.modality,
      logLikelihoodRatio: llr,
      weight,
      contribution: llr * weight,
      ageSeconds,
      score: observation.score,
      quality: observation.quality,
    });
  }

  for (const modality of ALL_MODALITIES) {
    if (!seen.has(modality)) {
      missing.push({ modality, reason: 'No observation available' });
    }
  }

  const discounted = applyCorrelationDiscount(contributions);
  const summed = discounted.reduce((total, entry) => total + entry.contribution, 0);
  const fusedLlr = PRIOR_LOG_ODDS + summed;

  const confidence = Math.round(sigmoid(fusedLlr) * 100);
  const band = bandFor(confidence, discounted, spoofDetected);

  return {
    confidence: spoofDetected ? 0 : confidence,
    band,
    fusedLogLikelihoodRatio: fusedLlr,
    contributions: discounted,
    missingModalities: missing,
    spoofDetected,
    policyVersion: FUSION_POLICY_VERSION,
  };
}

/**
 * Discounts correlated biometric agreement.
 *
 * Sorts positively-contributing biometric modalities by strength and scales
 * each subsequent one geometrically. The strongest keeps full weight; the
 * second gets 0.75, the third 0.56, and so on.
 *
 * Applied only to *positive* contributions. Disagreement between correlated
 * modalities is more informative than agreement, not less — if face says yes
 * and voice says no, that conflict should not be softened.
 */
function applyCorrelationDiscount(
  contributions: readonly ModalityContribution[],
): ModalityContribution[] {
  const biometricPositives = contributions
    .filter(
      (entry) =>
        entry.contribution > 0 &&
        entry.modality !== IdentityModality.DEVICE &&
        entry.modality !== IdentityModality.EXPLICIT,
    )
    .sort((a, b) => b.contribution - a.contribution);

  const discountByModality = new Map<IdentityModality, number>();
  biometricPositives.forEach((entry, index) => {
    discountByModality.set(entry.modality, Math.pow(CORRELATION_DISCOUNT, index));
  });

  return contributions.map((entry) => {
    const discount = discountByModality.get(entry.modality) ?? 1;
    if (discount === 1) return entry;

    return {
      ...entry,
      weight: entry.weight * discount,
      contribution: entry.contribution * discount,
    };
  });
}

/**
 * Maps confidence onto an operational band.
 *
 * Not a pure threshold on the score. **Evidence sufficiency is a separate
 * question from evidence direction**: a 96% confidence built from a single
 * stale device fingerprint is not the same claim as 96% from face, voice and
 * device agreeing, and treating them alike is how a system gets fooled by
 * someone who simply stole the phone.
 */
function bandFor(
  confidence: number,
  contributions: readonly ModalityContribution[],
  spoofDetected: boolean,
): IdentityBand {
  if (spoofDetected) return IdentityBand.IMPOSTOR;

  // Modalities carrying meaningful weight, not merely present.
  const informative = contributions.filter((entry) => entry.weight >= 0.25);
  const biometricInformative = informative.filter(
    (entry) => entry.modality !== IdentityModality.DEVICE,
  );

  // Thin evidence cannot reach a confident verdict in either direction.
  if (informative.length === 0) return IdentityBand.UNCERTAIN;

  if (confidence >= 90) {
    // VERIFIED requires corroboration: at least two informative modalities, one
    // of them biometric. Device presence alone never verifies a person.
    const corroborated = informative.length >= 2 && biometricInformative.length >= 1;
    return corroborated ? IdentityBand.VERIFIED : IdentityBand.PROBABLE;
  }

  if (confidence >= 70) return IdentityBand.PROBABLE;
  if (confidence >= 40) return IdentityBand.UNCERTAIN;
  if (confidence >= 15) return IdentityBand.SUSPECT;

  return IdentityBand.IMPOSTOR;
}

function selectNewest(observations: readonly ModalityObservation[]): ModalityObservation[] {
  const newest = new Map<IdentityModality, ModalityObservation>();

  for (const observation of observations) {
    const existing = newest.get(observation.modality);

    if (!existing || Date.parse(observation.capturedAt) > Date.parse(existing.capturedAt)) {
      newest.set(observation.modality, observation);
    }
  }

  return [...newest.values()];
}

function ageInSeconds(capturedAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - Date.parse(capturedAt)) / 1000);
}

function sigmoid(x: number): number {
  // Split by sign to avoid overflow in exp() for large negative inputs.
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const exp = Math.exp(x);
  return exp / (1 + exp);
}

/**
 * Plain-language explanation of an assessment.
 *
 * Generated from the contributions rather than written by hand, so the
 * explanation cannot drift from the arithmetic that produced the score. This is
 * what an operator reads and what appears in the incident timeline.
 */
export function explainAssessment(result: FusionResult): string[] {
  if (result.spoofDetected) {
    return [
      'A presentation attack was detected — a photograph, mask or audio replay was presented to a sensor.',
      'The confidence score is forced to zero: a detected spoof is an attack, not a low score to be weighed against other evidence.',
    ];
  }

  const lines: string[] = [];
  const ranked = [...result.contributions].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );

  for (const entry of ranked) {
    if (Math.abs(entry.contribution) < 0.05) continue;

    const direction = entry.contribution > 0 ? 'supports' : 'contradicts';
    const strength =
      Math.abs(entry.contribution) > 1.5
        ? 'strongly'
        : Math.abs(entry.contribution) > 0.5
          ? 'moderately'
          : 'weakly';

    lines.push(
      `${label(entry.modality)} ${strength} ${direction} the enrolled driver ` +
        `(score ${entry.score.toFixed(2)}, quality ${entry.quality.toFixed(2)}, ` +
        `${formatAge(entry.ageSeconds)} old).`,
    );
  }

  const unavailable = result.missingModalities.filter(
    (entry) => entry.reason !== 'No observation available',
  );

  for (const entry of unavailable) {
    lines.push(`${label(entry.modality)} was not usable: ${entry.reason.toLowerCase()}.`);
  }

  if (lines.length === 0) {
    lines.push('No usable identity evidence was available for this assessment.');
  }

  return lines;
}

function label(modality: IdentityModality): string {
  const labels: Record<IdentityModality, string> = {
    FACE: 'Facial recognition',
    VOICE: 'Voice recognition',
    DEVICE: 'Device fingerprint',
    BEHAVIOUR: 'Driving behaviour',
    INTERACTION: 'Phone interaction pattern',
    EXPLICIT: 'Explicit confirmation',
  };
  return labels[modality];
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
