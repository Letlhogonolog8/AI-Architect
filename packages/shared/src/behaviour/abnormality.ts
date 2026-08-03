import { BehaviourSignalClass, type AbnormalityAssessment } from '@aegisdrive/types';
import { clamp01 } from './catalogue';

/**
 * Abnormal behaviour detection.
 *
 * Measures how far a window of cabin behaviour sits from **this subject's own**
 * normal, and nothing else.
 *
 * ## Why the comparison is personal rather than population-wide
 *
 * A population anomaly detector flags whoever is least like its training data.
 * In practice that means it flags the same people over and over — the ones who
 * drive at unusual hours, whose cabins are noisier, whose bodies move
 * differently, whose first language is not the one the acoustic model was fitted
 * on. Those people are not more dangerous. They are just further from the mean,
 * and a system built this way delivers its false accusations to the same
 * addresses every week.
 *
 * Comparing a person only against their own history removes that failure mode
 * completely. The cost is real — the engine can say nothing about a driver until
 * a baseline exists — and it is a cost worth paying in a product that can send
 * armed responders to someone.
 *
 * ## Why this is statistics rather than a learned model
 *
 * The same reason as `services/ai/app/identity/behaviour.py`: there is no
 * labelled corpus of hijacking cabin footage to train on, so a deep model would
 * be fitted to whatever proxy was available and would produce confident
 * nonsense. A z-score against a per-person baseline produces a weaker claim that
 * is honest about being weak, and it is explainable by construction — "your
 * cabin was four standard deviations louder than your normal" is something an
 * operator can act on and a driver can contest.
 */

export const ABNORMALITY_MODEL_VERSION = 'abnormality-v1' as const;

/**
 * The feature set.
 *
 * Adding a feature invalidates every existing baseline, so the list is versioned
 * with the model id rather than edited in place.
 *
 * Every entry is a **shape-of-behaviour statistic**. None of them carries
 * location, destination, time of day or route identity. A baseline holding
 * those would discriminate better and would also be a movement-tracking record
 * of a named worker, which is not a trade this product makes.
 */
export const CABIN_FEATURE_NAMES: readonly string[] = [
  'motion_energy_mean',
  'motion_energy_variance',
  'postural_shift_rate',
  'head_movement_rate',
  'occupant_count_mean',
  'vocal_intensity_mean',
  'vocal_f0_mean',
  'speech_rate_mean',
  'speech_presence_ratio',
  'control_input_variance',
];

/** Which class each feature belongs to, for corroboration accounting. */
const FEATURE_CLASS: Readonly<Record<string, BehaviourSignalClass>> = Object.freeze({
  motion_energy_mean: BehaviourSignalClass.MOTION,
  motion_energy_variance: BehaviourSignalClass.MOTION,
  postural_shift_rate: BehaviourSignalClass.POSTURE,
  head_movement_rate: BehaviourSignalClass.POSTURE,
  occupant_count_mean: BehaviourSignalClass.CABIN,
  vocal_intensity_mean: BehaviourSignalClass.VOCAL,
  vocal_f0_mean: BehaviourSignalClass.VOCAL,
  speech_rate_mean: BehaviourSignalClass.VOCAL,
  speech_presence_ratio: BehaviourSignalClass.VOCAL,
  control_input_variance: BehaviourSignalClass.CONTROL,
});

/**
 * Windows required before a baseline discriminates.
 *
 * Below this, the standard deviations are dominated by however the first few
 * trips happened to go, and every subsequent normal trip reads as an anomaly.
 */
export const MINIMUM_BASELINE_WINDOWS = 20;

/** Baselines older than this are stale: a person's ordinary changes. */
export const BASELINE_VALIDITY_DAYS = 90;

export interface BaselineStatistics {
  mean: number;
  standardDeviation: number;
  /** Welford's running sum of squared deviations. Internal to the update. */
  m2?: number;
}

export interface AbnormalityInput {
  /** Feature name to observed value for this window. */
  features: Record<string, number>;
  /** The subject's baseline, or null when none exists. */
  baseline: Record<string, BaselineStatistics> | null;
  baselineWindowCount: number;
  now?: Date;
}

export function assessAbnormality(input: AbnormalityInput): AbnormalityAssessment {
  const now = input.now ?? new Date();

  if (!input.baseline || input.baselineWindowCount < MINIMUM_BASELINE_WINDOWS) {
    return {
      abnormalityScore: 0,
      deviations: [],
      baselineWindowCount: input.baselineWindowCount,
      baselineInsufficient: true,
      coverage: 0,
      modelId: ABNORMALITY_MODEL_VERSION,
      assessedAt: now.toISOString(),
    };
  }

  const deviations: AbnormalityAssessment['deviations'] = [];

  for (const feature of CABIN_FEATURE_NAMES) {
    const value = input.features[feature];
    const stats = input.baseline[feature];

    if (value === undefined || stats === undefined) continue;
    if (!Number.isFinite(value)) continue;

    // A zero-variance feature means every observed window was identical, which
    // in real sensor data means the sensor was stuck. Treating it as infinitely
    // discriminative would let one broken input dominate the score.
    if (stats.standardDeviation <= 1e-6) continue;

    const z = (value - stats.mean) / stats.standardDeviation;

    deviations.push({
      feature,
      deviation: round3(z),
      signalClass: FEATURE_CLASS[feature] ?? BehaviourSignalClass.MOTION,
    });
  }

  if (deviations.length === 0) {
    return {
      abnormalityScore: 0,
      deviations: [],
      baselineWindowCount: input.baselineWindowCount,
      baselineInsufficient: false,
      coverage: 0,
      modelId: ABNORMALITY_MODEL_VERSION,
      assessedAt: now.toISOString(),
    };
  }

  // Root-mean-square over absolute z-scores. Both directions count here, unlike
  // the arousal index: a cabin that has gone abnormally *quiet* is as much a
  // departure from normal as one that has gone abnormally loud, and in a
  // hijacking it is the more common of the two.
  const rms = Math.sqrt(
    deviations.reduce((total, entry) => total + entry.deviation * entry.deviation, 0) /
      deviations.length,
  );

  // Half-normal mapping, identical in form to the identity behaviour scorer so
  // the two produce comparable magnitudes: z=1 → 0.39, z=2 → 0.86, z=3 → 0.99.
  const abnormality = 1 - Math.exp(-0.5 * rms * rms);

  const coverage = deviations.length / CABIN_FEATURE_NAMES.length;

  return {
    // Coverage scales the score directly: an anomaly seen in three features is
    // a weaker claim than the same anomaly seen in ten, and the score should
    // say so rather than leaving it to a caveat nobody reads.
    abnormalityScore: round3(clamp01(abnormality * coverage)),
    deviations: deviations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    baselineWindowCount: input.baselineWindowCount,
    baselineInsufficient: false,
    coverage: round3(coverage),
    modelId: ABNORMALITY_MODEL_VERSION,
    assessedAt: now.toISOString(),
  };
}

/**
 * Folds a window into the baseline using Welford's online algorithm.
 *
 * Online rather than batch, for the same reason as the identity baseline: the
 * alternative is retaining every window's features indefinitely so the baseline
 * can be recomputed, which is precisely the accumulating behavioural record
 * this design exists to avoid. Welford keeps a running mean and variance, so the
 * window can be discarded the moment it has been folded in.
 */
export function updateCabinBaseline(
  existing: Record<string, BaselineStatistics>,
  windowCount: number,
  features: Record<string, number>,
): Record<string, BaselineStatistics> {
  const updated: Record<string, BaselineStatistics> = {};
  const n = windowCount + 1;

  for (const feature of CABIN_FEATURE_NAMES) {
    const value = features[feature];
    const previous = existing[feature];

    if (value === undefined || !Number.isFinite(value)) {
      if (previous !== undefined) updated[feature] = previous;
      continue;
    }

    if (previous === undefined) {
      updated[feature] = { mean: value, standardDeviation: 0, m2: 0 };
      continue;
    }

    const delta = value - previous.mean;
    const mean = previous.mean + delta / n;
    const m2 = (previous.m2 ?? 0) + delta * (value - mean);

    updated[feature] = {
      mean,
      m2,
      standardDeviation: n > 1 ? Math.sqrt(m2 / n) : 0,
    };
  }

  return updated;
}

/**
 * Whether a baseline should still be trusted.
 *
 * A baseline that is too old describes a person who no longer exists — new
 * route, new vehicle, new job, a healed injury. A stale baseline does not fail
 * safe: it reads ordinary change as anomaly, which in this system means
 * accusing someone of being hijacked because they changed cars.
 */
export function isBaselineStale(lastUpdatedAt: string, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - Date.parse(lastUpdatedAt);
  if (!Number.isFinite(ageMs)) return true;

  return ageMs > BASELINE_VALIDITY_DAYS * 86_400_000;
}

export function explainAbnormality(assessment: AbnormalityAssessment): string[] {
  if (assessment.baselineInsufficient) {
    return [
      `No usable behavioural baseline: ${assessment.baselineWindowCount} of ${MINIMUM_BASELINE_WINDOWS} required observation windows recorded. Abnormality cannot be assessed for this driver yet.`,
    ];
  }

  const notable = assessment.deviations.filter((entry) => Math.abs(entry.deviation) >= 2);

  if (notable.length === 0) {
    return ["Cabin behaviour is within this driver's normal range."];
  }

  return notable.map((entry) => {
    const direction = entry.deviation > 0 ? 'above' : 'below';
    return `${entry.feature.replace(/_/g, ' ')} is ${Math.abs(entry.deviation).toFixed(1)} standard deviations ${direction} this driver's baseline.`;
  });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
