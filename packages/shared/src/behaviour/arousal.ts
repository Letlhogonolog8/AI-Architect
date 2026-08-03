import {
  BehaviourSignalClass,
  type ArousalAssessment,
  type ArousalIndicator,
} from '@aegisdrive/types';
import { clamp01 } from './catalogue';

/**
 * Arousal index — the "stress detection" surface, named for what it measures.
 *
 * ## What this computes
 *
 * A single 0-1 number summarising how far an occupant's observable physical
 * activity has departed from their own resting pattern: how much they are
 * moving, how loudly and quickly they are speaking, how often their posture
 * shifts. Every input is a standard-deviation departure from that person's own
 * baseline, so the output is "more active than usual for them", not "more
 * active than a reference human".
 *
 * ## What it deliberately does not compute
 *
 * A feeling. There is no mapping from this number onto fear, anger, panic or
 * calm, and adding one would be the single most damaging change anyone could
 * make to this file.
 *
 * The reason is not squeamishness, it is accuracy. Autonomic arousal is real
 * and measurable; the *emotion* attached to it is not recoverable from the
 * outside. The same elevated index is produced by a hijacking, an argument, a
 * near miss at an intersection, a hot cabin, a fast song, and running late for
 * a delivery — and the last five are thousands of times more common than the
 * first. A system that printed "FEAR: 0.82" would be believed, and it would be
 * wrong nearly every time it fired.
 *
 * So the engine reports the measurement and stops. The arousal index is worth
 * something only in combination with evidence of a different kind, which is
 * exactly how the threat scorer consumes it — as one input among several
 * classes, capped so it can never carry a score alone.
 *
 * ## Why the aggregate is RMS rather than a mean
 *
 * Squaring emphasises one sharply deviant indicator over several mildly
 * deviant ones. A person whose movement, voice and posture are all slightly
 * above baseline is probably warm or in traffic. A person whose movement is
 * six standard deviations out while everything else is normal is doing
 * something that deserves a look.
 */

export const AROUSAL_MODEL_VERSION = 'arousal-v1' as const;

/**
 * Deviation at which an indicator is considered fully elevated.
 *
 * Three standard deviations. Under a normal approximation that is roughly the
 * top 0.1% of a person's own distribution — rare enough to be worth noticing,
 * common enough that a normal week of driving will still produce a few.
 */
const SATURATION_SIGMA = 3;

/**
 * Per-class weights.
 *
 * Motion and posture are weighted above voice because they are measured more
 * reliably in a moving vehicle. Cabin audio in a car at 120 km/h with the
 * windows down is frequently unusable, and prosodic measures degrade faster
 * than anything else here.
 */
const CLASS_WEIGHT: Readonly<Record<BehaviourSignalClass, number>> = Object.freeze({
  [BehaviourSignalClass.MOTION]: 1.0,
  [BehaviourSignalClass.POSTURE]: 1.0,
  [BehaviourSignalClass.VOCAL]: 0.7,
  [BehaviourSignalClass.CONTROL]: 0.6,
  [BehaviourSignalClass.CABIN]: 0.4,

  // Zero, and deliberately enumerated rather than defaulted.
  //
  // These classes carry real evidence — a weapon on camera, breaking glass, a
  // covered lens — but none of it is a *physiological* measurement, and arousal
  // is an index over one person's own bodily activity. Folding an object
  // detection into it would mean a driver's arousal index rose because someone
  // else brought a crowbar into the vehicle.
  //
  // They are listed so the exclusion is visible. A future class added without
  // thinking about this will fail to compile rather than silently inherit a
  // weight it was never assessed for.
  [BehaviourSignalClass.OBJECT]: 0,
  [BehaviourSignalClass.ACOUSTIC_EVENT]: 0,
  [BehaviourSignalClass.DEVICE]: 0,
});

/** Below this many usable indicators the index is not reported at all. */
const MINIMUM_INDICATORS = 2;

export interface ArousalInput {
  indicators: readonly ArousalIndicator[];
  /** True when the subject has no usable baseline yet. */
  baselineMissing: boolean;
  now?: Date;
}

export function assessArousal(input: ArousalInput): ArousalAssessment {
  const now = input.now ?? new Date();

  // Quality gates first. An indicator measured badly is not a small amount of
  // evidence; it is no evidence, and averaging it in dilutes the ones that
  // were measured properly.
  const usable = input.indicators.filter(
    (indicator) => indicator.quality >= 0.3 && Number.isFinite(indicator.deviation),
  );

  if (usable.length < MINIMUM_INDICATORS) {
    return {
      arousalIndex: 0,
      confidence: 0,
      indicators: [...input.indicators],
      baselineMissing: input.baselineMissing,
      modelId: AROUSAL_MODEL_VERSION,
      assessedAt: now.toISOString(),
    };
  }

  let weightedSquares = 0;
  let totalWeight = 0;

  for (const indicator of usable) {
    const classWeight = CLASS_WEIGHT[indicator.signalClass] ?? 0.5;
    const weight = classWeight * indicator.quality;

    // Only upward departures count toward arousal. A person moving *less* than
    // usual is a different signal entirely — it is handled as
    // ABNORMAL_STILLNESS, which carries its own likelihood ratio, rather than
    // being folded in here where it would silently cancel out an elevation
    // somewhere else.
    const elevation = Math.max(0, indicator.deviation) / SATURATION_SIGMA;

    weightedSquares += weight * elevation * elevation;
    totalWeight += weight;
  }

  const rms = totalWeight > 0 ? Math.sqrt(weightedSquares / totalWeight) : 0;

  // Confidence tracks how much of the sensor picture was actually available.
  // Coverage against the full class set, scaled by mean quality.
  const classesPresent = new Set(usable.map((indicator) => indicator.signalClass)).size;
  const meanQuality =
    usable.reduce((total, indicator) => total + indicator.quality, 0) / usable.length;

  const coverage = clamp01(classesPresent / 3);
  let confidence = clamp01(coverage * meanQuality);

  // Without a baseline the index is computed against population defaults. It
  // is still reported — a missing baseline should not blind the engine — but
  // the confidence says plainly that it means much less.
  if (input.baselineMissing) confidence *= 0.4;

  return {
    arousalIndex: round3(clamp01(rms)),
    confidence: round3(confidence),
    indicators: [...input.indicators],
    baselineMissing: input.baselineMissing,
    modelId: AROUSAL_MODEL_VERSION,
    assessedAt: now.toISOString(),
  };
}

/**
 * Plain-language rendering of an arousal assessment.
 *
 * Phrased as measurement throughout — "moving more than usual", never "appears
 * frightened". An operator reading this must not come away believing the system
 * detected an emotion, because it did not, and because their next action may
 * put armed responders next to a citizen.
 */
export function explainArousal(assessment: ArousalAssessment): string[] {
  if (assessment.confidence === 0) {
    return ['Insufficient usable sensor data to characterise physical activity.'];
  }

  const lines: string[] = [];

  const elevated = assessment.indicators
    .filter((indicator) => indicator.deviation >= 1.5 && indicator.quality >= 0.3)
    .sort((a, b) => b.deviation - a.deviation);

  for (const indicator of elevated) {
    lines.push(
      `${humanise(indicator.name)} is ${indicator.deviation.toFixed(1)} standard deviations above this person's own baseline.`,
    );
  }

  if (lines.length === 0) {
    lines.push("Physical activity is within this person's normal range.");
  }

  if (assessment.baselineMissing) {
    lines.push(
      'No personal baseline exists yet, so these figures are measured against population defaults and are substantially less meaningful.',
    );
  }

  // Stated on every explanation, not only the alarming ones. The caveat is
  // least likely to be read at exactly the moment it matters most.
  lines.push(
    'This is a measure of physical activity, not of emotional state. Elevated activity is far more often caused by traffic, conversation or haste than by a threat.',
  );

  return lines;
}

function humanise(name: string): string {
  const labels: Record<string, string> = {
    motion_energy: 'Cabin movement',
    postural_shift_rate: 'Rate of posture change',
    vocal_f0: 'Voice pitch',
    vocal_intensity: 'Voice loudness',
    speech_rate: 'Speaking rate',
    vocal_jitter: 'Voice pitch stability',
    vocal_shimmer: 'Voice volume stability',
    control_input_variance: 'Steering and pedal variability',
    head_movement_rate: 'Head movement',
  };

  return labels[name] ?? name.replace(/_/g, ' ');
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
