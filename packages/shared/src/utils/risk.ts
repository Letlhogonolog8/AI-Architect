import { IncidentSeverity, ThreatLevel } from '@aegisdrive/types';

/**
 * Deterministic mapping between the continuous risk score the AI services emit
 * and the discrete posture levels the UI renders. Kept here so the API, the web
 * client and the mobile client never disagree about what "ELEVATED" means.
 */

interface ThreatBand {
  level: ThreatLevel;
  /** Inclusive lower bound of the 0-100 risk score. */
  min: number;
}

const THREAT_BANDS: readonly ThreatBand[] = [
  { level: ThreatLevel.SEVERE, min: 85 },
  { level: ThreatLevel.HIGH, min: 65 },
  { level: ThreatLevel.ELEVATED, min: 40 },
  { level: ThreatLevel.GUARDED, min: 20 },
  { level: ThreatLevel.MINIMAL, min: 0 },
];

export function clampRiskScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function riskScoreToThreatLevel(score: number): ThreatLevel {
  const clamped = clampRiskScore(score);
  const band = THREAT_BANDS.find((candidate) => clamped >= candidate.min);
  return band?.level ?? ThreatLevel.MINIMAL;
}

/** Severity a newly detected threat should be raised at, given its level. */
export function threatLevelToSeverity(level: ThreatLevel): IncidentSeverity {
  switch (level) {
    case ThreatLevel.SEVERE:
      return IncidentSeverity.CRITICAL;
    case ThreatLevel.HIGH:
      return IncidentSeverity.HIGH;
    case ThreatLevel.ELEVATED:
      return IncidentSeverity.MEDIUM;
    case ThreatLevel.GUARDED:
      return IncidentSeverity.LOW;
    case ThreatLevel.MINIMAL:
      return IncidentSeverity.INFO;
  }
}
