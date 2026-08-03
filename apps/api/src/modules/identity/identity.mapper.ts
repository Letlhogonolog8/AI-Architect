import type { IdentityAssessment as AssessmentRow } from '@prisma/client';
import type {
  IdentityAssessment,
  IdentityBand,
  IdentityModality,
  ModalityContribution,
} from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * `contributions` and `missingModalities` are stored as `Json` and narrowed
 * here. They are parsed defensively rather than cast: an assessment written by
 * an older fusion version may have a shape today's code does not expect, and a
 * historical record must still render rather than crash the incident view an
 * investigator has opened.
 */
export function toAssessmentDto(row: AssessmentRow): IdentityAssessment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    driverId: row.driverId,
    vehicleId: row.vehicleId,
    confidence: row.confidence,
    band: row.band as IdentityBand,
    fusedLogLikelihoodRatio: row.fusedLogLikelihoodRatio,
    contributions: parseContributions(row.contributions),
    missingModalities: parseMissing(row.missingModalities),
    spoofDetected: row.spoofDetected,
    occupancy:
      row.occupantCount === null
        ? null
        : {
            occupantCount: row.occupantCount,
            recognisedCount: row.occupantCount - (row.unrecognisedCount ?? 0),
            unrecognisedCount: row.unrecognisedCount ?? 0,
            expectedCount: row.expectedCount,
            unexpectedOccupancy: row.unexpectedOccupancy,
            // Not persisted separately: the assessment was only written because
            // the count cleared the confidence gate in the policy layer.
            confidence: 1,
            modelId: 'occupancy-v1',
            assessedAt: row.assessedAt.toISOString(),
          },
    assessedAt: row.assessedAt.toISOString(),
    policyVersion: row.policyVersion,
  };
}

function parseContributions(value: unknown): ModalityContribution[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ModalityContribution[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;

    if (typeof record.modality !== 'string') return [];

    return [
      {
        modality: record.modality as IdentityModality,
        logLikelihoodRatio: numberOr(record.logLikelihoodRatio, 0),
        weight: numberOr(record.weight, 0),
        contribution: numberOr(record.contribution, 0),
        ageSeconds: numberOr(record.ageSeconds, 0),
        score: numberOr(record.score, 0),
        quality: numberOr(record.quality, 0),
      },
    ];
  });
}

function parseMissing(value: unknown): Array<{ modality: IdentityModality; reason: string }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;

    if (typeof record.modality !== 'string') return [];

    return [
      {
        modality: record.modality as IdentityModality,
        reason: typeof record.reason === 'string' ? record.reason : 'Unknown',
      },
    ];
  });
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
