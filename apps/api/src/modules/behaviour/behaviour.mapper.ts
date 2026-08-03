import type { BehaviourAssessment as AssessmentRow } from '@prisma/client';
import type {
  BehaviourAssessment,
  BehaviourObservation,
  BehaviourSignal,
  DuressAssessment,
  IdentityBand,
  ThreatContribution,
  ThreatEvidenceClass,
  ThreatLevel,
} from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * The JSON columns are parsed defensively rather than cast. An assessment
 * written by an older scorer may have a shape today's code does not expect, and
 * a historical record must still render rather than crash the incident view an
 * investigator has open. A cast would turn a schema change into a 500 on
 * exactly the screen that matters most.
 */
export function toAssessmentDto(row: AssessmentRow): BehaviourAssessment {
  const duress = buildDuress(row);

  return {
    id: row.id,
    organizationId: row.organizationId,
    driverId: row.driverId,
    vehicleId: row.vehicleId,

    threat: {
      score: row.threatScore,
      level: row.threatLevel as ThreatLevel,
      positivePredictiveValue: row.positivePredictiveValue,
      baseRatePerTripHour: row.baseRatePerTripHour,
      logLikelihoodRatio: row.logLikelihoodRatio,
      contributions: parseContributions(row.contributions),
      corroboratingClasses: parseClasses(row.corroboratingClasses),
      corroborationCapped: row.corroborationCapped,
      capReason: row.capReason,
      // Regenerated from the stored contributions rather than persisted, so the
      // prose can never disagree with the arithmetic it describes.
      explanation: [],
      scoredAt: row.assessedAt.toISOString(),
      policyVersion: row.policyVersion,
    },

    arousal:
      row.arousalIndex === null
        ? null
        : {
            arousalIndex: row.arousalIndex,
            confidence: row.arousalConfidence ?? 0,
            // Indicators are not persisted per assessment: they are intermediate
            // measurements, and retaining them across every window would build
            // the continuous physiological record this engine avoids. The index
            // and its confidence are what an operator needs.
            indicators: [],
            baselineMissing: row.arousalConfidence === null,
            modelId: 'arousal-v1',
            assessedAt: row.assessedAt.toISOString(),
          },

    // Voice and cabin detail live in the signal list rather than as separate
    // stored structures. Persisting them twice would let the two drift.
    voice: null,
    cabin:
      row.occupantCount === null
        ? null
        : {
            occupantCount: row.occupantCount,
            expectedCount: row.expectedCount,
            signals: [],
            poses: [],
            secondsSinceOccupancyChange: null,
            confidence: 1,
            modelId: 'cabin-dynamics-v1',
            assessedAt: row.assessedAt.toISOString(),
          },

    abnormality:
      row.abnormalityScore === null
        ? null
        : {
            abnormalityScore: row.abnormalityScore,
            deviations: [],
            baselineWindowCount: 0,
            baselineInsufficient: false,
            coverage: 0,
            modelId: 'abnormality-v1',
            assessedAt: row.assessedAt.toISOString(),
          },

    identityBand: row.identityBand as IdentityBand | null,
    signals: parseSignals(row.signals),
    duress,

    assessedAt: row.assessedAt.toISOString(),
    policyVersion: row.policyVersion,
  };
}

function buildDuress(row: AssessmentRow): DuressAssessment | null {
  if (!row.duressIndicated && !row.duressDeliberate) return null;

  return {
    indicated: row.duressIndicated,
    confidence: row.duressConfidence ?? 0,
    deliberateSignal: row.duressDeliberate,
    basis: parseStringArray(row.duressBasis),
    suppressInVehicleFeedback: true,
  };
}

function parseContributions(value: unknown): ThreatContribution[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ThreatContribution[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;

    if (typeof record.source !== 'string') return [];

    return [
      {
        evidenceClass: record.evidenceClass as ThreatEvidenceClass,
        source: record.source,
        likelihoodRatio: numberOr(record.likelihoodRatio, 1),
        weight: numberOr(record.weight, 0),
        contribution: numberOr(record.contribution, 0),
        ageSeconds: numberOr(record.ageSeconds, 0),
        description: typeof record.description === 'string' ? record.description : '',
      },
    ];
  });
}

function parseSignals(value: unknown): BehaviourObservation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): BehaviourObservation[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;

    if (typeof record.signal !== 'string') return [];

    return [
      {
        signal: record.signal as BehaviourSignal,
        strength: numberOr(record.strength, 0),
        detectorConfidence: numberOr(record.detectorConfidence, 0),
        quality: numberOr(record.quality, 0),
        baselineDeviation:
          typeof record.baselineDeviation === 'number' && Number.isFinite(record.baselineDeviation)
            ? record.baselineDeviation
            : null,
        durationSeconds: numberOr(record.durationSeconds, 0),
        observedAt:
          typeof record.observedAt === 'string' ? record.observedAt : new Date(0).toISOString(),
        modelId: typeof record.modelId === 'string' ? record.modelId : 'unknown-v0',
      },
    ];
  });
}

function parseClasses(value: unknown): ThreatEvidenceClass[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ThreatEvidenceClass => typeof entry === 'string');
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
