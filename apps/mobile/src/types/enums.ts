/**
 * MIRROR OF packages/types/src/enums.ts
 *
 * ⚠️  This file is duplicated on purpose and must not diverge.
 *
 * `apps/mobile` is outside the pnpm workspace (see
 * docs/adr/0003-mobile-standalone.md), so it cannot import `@aegisdrive/types`.
 * These string values are load-bearing across the API, the web console and this
 * app: a mismatch is a silent data bug, not a compile error.
 *
 * `scripts/check-enum-drift.mjs` diffs this file against the canonical one and
 * fails CI on divergence. If that check fails, fix this file — never the other
 * direction.
 */

export const RoleName = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  SECURITY: 'SECURITY',
  POLICE: 'POLICE',
  DRIVER: 'DRIVER',
  ANALYST: 'ANALYST',
} as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  IN_TRANSIT: 'IN_TRANSIT',
  UNDER_THREAT: 'UNDER_THREAT',
  IMMOBILISED: 'IMMOBILISED',
  STOLEN: 'STOLEN',
  RECOVERED: 'RECOVERED',
  MAINTENANCE: 'MAINTENANCE',
  DECOMMISSIONED: 'DECOMMISSIONED',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const ProtectionMode = {
  PASSIVE: 'PASSIVE',
  GUARDIAN: 'GUARDIAN',
  SENTINEL: 'SENTINEL',
  ESCORT: 'ESCORT',
} as const;
export type ProtectionMode = (typeof ProtectionMode)[keyof typeof ProtectionMode];

export const DriverStatus = {
  ON_DUTY: 'ON_DUTY',
  OFF_DUTY: 'OFF_DUTY',
  DRIVING: 'DRIVING',
  RESTING: 'RESTING',
  DISTRESS: 'DISTRESS',
  UNREACHABLE: 'UNREACHABLE',
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

export const IncidentType = {
  HIJACKING: 'HIJACKING',
  ATTEMPTED_HIJACKING: 'ATTEMPTED_HIJACKING',
  THEFT: 'THEFT',
  KIDNAPPING: 'KIDNAPPING',
  COERCION: 'COERCION',
  SMASH_AND_GRAB: 'SMASH_AND_GRAB',
  UNAUTHORISED_USE: 'UNAUTHORISED_USE',
  PANIC_ACTIVATION: 'PANIC_ACTIVATION',
  GEOFENCE_BREACH: 'GEOFENCE_BREACH',
  COLLISION: 'COLLISION',
  MEDICAL: 'MEDICAL',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

export const IncidentSeverity = {
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type IncidentSeverity = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
  DETECTED: 'DETECTED',
  TRIAGED: 'TRIAGED',
  ESCALATED: 'ESCALATED',
  RESPONDING: 'RESPONDING',
  CONTAINED: 'CONTAINED',
  RESOLVED: 'RESOLVED',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const EvidenceType = {
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  IMAGE: 'IMAGE',
  TELEMETRY_SNAPSHOT: 'TELEMETRY_SNAPSHOT',
  DOCUMENT: 'DOCUMENT',
  AI_INFERENCE: 'AI_INFERENCE',
  SYSTEM_LOG: 'SYSTEM_LOG',
} as const;
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType];

export const EvidenceStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  UPLOADING: 'UPLOADING',
  SEALED: 'SEALED',
  VERIFIED: 'VERIFIED',
  CORRUPTED: 'CORRUPTED',
  PURGED: 'PURGED',
} as const;
export type EvidenceStatus = (typeof EvidenceStatus)[keyof typeof EvidenceStatus];

export const TelemetrySource = {
  OBD: 'OBD',
  GPS_TRACKER: 'GPS_TRACKER',
  DASHCAM: 'DASHCAM',
  MOBILE_APP: 'MOBILE_APP',
  CAN_BUS: 'CAN_BUS',
  SIMULATION: 'SIMULATION',
} as const;
export type TelemetrySource = (typeof TelemetrySource)[keyof typeof TelemetrySource];

export const ThreatLevel = {
  MINIMAL: 'MINIMAL',
  GUARDED: 'GUARDED',
  ELEVATED: 'ELEVATED',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE',
} as const;
export type ThreatLevel = (typeof ThreatLevel)[keyof typeof ThreatLevel];

export const CorridorStatus = {
  CLEAR: 'CLEAR',
  CAUTION: 'CAUTION',
  DEGRADED: 'DEGRADED',
  CLOSED: 'CLOSED',
} as const;
export type CorridorStatus = (typeof CorridorStatus)[keyof typeof CorridorStatus];

export const SEVERITY_ORDER: readonly IncidentSeverity[] = [
  IncidentSeverity.INFO,
  IncidentSeverity.LOW,
  IncidentSeverity.MEDIUM,
  IncidentSeverity.HIGH,
  IncidentSeverity.CRITICAL,
];

export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.TRIAGED,
  IncidentStatus.ESCALATED,
  IncidentStatus.RESPONDING,
];
