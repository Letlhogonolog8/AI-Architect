import type { ThreatDecision as DecisionRow } from '@prisma/client';
import type {
  AppliedConstraint,
  AutonomyLevel,
  DecisionAction,
  DecisionConfidence,
  DecisionGraph,
  HypothesisPosterior,
  IncidentSeverity,
  ThreatDecision,
  ThreatHypothesis,
} from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * The JSON columns are parsed defensively rather than cast. A decision written
 * by an earlier engine version may have a shape today's code does not expect,
 * and a historical decision must still render — this is the record an
 * investigator opens when asking why a response was recommended, and a cast
 * failure there would be the worst possible time for one.
 */
export function toDecisionDto(row: DecisionRow): ThreatDecision {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    driverId: row.driverId,

    leadingHypothesis: row.leadingHypothesis as ThreatHypothesis,
    anomalyProbability: row.anomalyProbability,
    hypothesisConfidence: row.hypothesisConfidence,
    posteriors: parsePosteriors(row.posteriors),

    confidence: parseConfidence(row.confidenceDetail, row.confidenceOverall),

    actions: parseStringArray(row.actions) as DecisionAction[],
    autonomyLevel: row.autonomyLevel as AutonomyLevel,
    severity: row.severity as IncidentSeverity,
    constraints: parseConstraints(row.constraints),

    graph: parseGraph(row.graph),
    explanation: parseStringArray(row.explanation),

    inputs: parseInputs(row.inputs),

    decidedAt: row.decidedAt.toISOString(),
    engineVersion: row.engineVersion,
    calibrationSource: row.calibrationSource,

    override:
      row.overrideHypothesis === null
        ? null
        : {
            hypothesis: row.overrideHypothesis as ThreatHypothesis,
            reason: row.overrideReason ?? '',
            userId: row.overrideByUserId ?? '',
            at: row.overrideAt?.toISOString() ?? row.decidedAt.toISOString(),
          },
  };
}

function parsePosteriors(value: unknown): HypothesisPosterior[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): HypothesisPosterior[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.hypothesis !== 'string') return [];

    return [
      {
        hypothesis: record.hypothesis as ThreatHypothesis,
        prior: numberOr(record.prior, 0),
        logLikelihood: numberOr(record.logLikelihood, 0),
        posterior: numberOr(record.posterior, 0),
        conditional: numberOr(record.conditional, 0),
        supportingSignals: Array.isArray(record.supportingSignals)
          ? (record.supportingSignals as HypothesisPosterior['supportingSignals'])
          : [],
      },
    ];
  });
}

function parseConfidence(value: unknown, overall: number): DecisionConfidence {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    overall,
    evidenceCoverage: numberOr(record.evidenceCoverage, 0),
    sensorHealth: numberOr(record.sensorHealth, 0),
    calibrationTrust: numberOr(record.calibrationTrust, 0),
    dataSufficiency: numberOr(record.dataSufficiency, 0),
    discrimination: numberOr(record.discrimination, 0),
    limitations: parseStringArray(record.limitations),
  };
}

function parseConstraints(value: unknown): AppliedConstraint[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): AppliedConstraint[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.code !== 'string') return [];

    return [
      {
        code: record.code,
        blockedAction: typeof record.blockedAction === 'string' ? record.blockedAction : '',
        reason: typeof record.reason === 'string' ? record.reason : '',
        authority: typeof record.authority === 'string' ? record.authority : '',
      },
    ];
  });
}

function parseGraph(value: unknown): DecisionGraph {
  if (typeof value !== 'object' || value === null) {
    return { nodes: [], edges: [], rootNodeId: '' };
  }

  const record = value as Record<string, unknown>;

  return {
    nodes: Array.isArray(record.nodes) ? (record.nodes as DecisionGraph['nodes']) : [],
    edges: Array.isArray(record.edges) ? (record.edges as DecisionGraph['edges']) : [],
    rootNodeId: typeof record.rootNodeId === 'string' ? record.rootNodeId : '',
  };
}

function parseInputs(value: unknown): ThreatDecision['inputs'] {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    signals: Array.isArray(record.signals)
      ? (record.signals as ThreatDecision['inputs']['signals'])
      : [],
    identityBand: (record.identityBand ?? null) as ThreatDecision['inputs']['identityBand'],
    identityConfidence:
      typeof record.identityConfidence === 'number' ? record.identityConfidence : null,
    threatScore: typeof record.threatScore === 'number' ? record.threatScore : null,
    evidenceClasses: parseStringArray(
      record.evidenceClasses,
    ) as ThreatDecision['inputs']['evidenceClasses'],
    sensorsExpected: numberOr(record.sensorsExpected, 0),
    sensorsHealthy: numberOr(record.sensorsHealthy, 0),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
