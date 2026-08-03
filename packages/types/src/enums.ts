/**
 * Domain enumerations.
 *
 * These are declared as frozen const objects rather than TypeScript `enum`s so
 * that they survive `isolatedModules`, are tree-shakeable, and can be iterated
 * at runtime by the web and mobile clients without pulling in Prisma. The
 * string values are the single source of truth and must stay byte-identical to
 * the enums declared in `apps/api/prisma/schema.prisma`.
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

export const OrganizationTier = {
  PILOT: 'PILOT',
  STANDARD: 'STANDARD',
  ENTERPRISE: 'ENTERPRISE',
  GOVERNMENT: 'GOVERNMENT',
} as const;
export type OrganizationTier = (typeof OrganizationTier)[keyof typeof OrganizationTier];

export const VehicleType = {
  SEDAN: 'SEDAN',
  SUV: 'SUV',
  BAKKIE: 'BAKKIE',
  VAN: 'VAN',
  TRUCK: 'TRUCK',
  BUS: 'BUS',
  MOTORCYCLE: 'MOTORCYCLE',
  ARMOURED: 'ARMOURED',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

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
  /** Telemetry only. No autonomous action. */
  PASSIVE: 'PASSIVE',
  /** Full behavioural modelling, alerts on anomaly. */
  GUARDIAN: 'GUARDIAN',
  /** Guardian plus autonomous countermeasures (immobilisation, dispatch). */
  SENTINEL: 'SENTINEL',
  /** Executive protection: continuous human-in-the-loop monitoring. */
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

export const AlertType = {
  PANIC: 'PANIC',
  ANOMALY: 'ANOMALY',
  PREDICTIVE_RISK: 'PREDICTIVE_RISK',
  GEOFENCE: 'GEOFENCE',
  DEVICE_TAMPER: 'DEVICE_TAMPER',
  SIGNAL_LOSS: 'SIGNAL_LOSS',
  DRIVER_BEHAVIOUR: 'DRIVER_BEHAVIOUR',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const AlertStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  SUPPRESSED: 'SUPPRESSED',
  CLOSED: 'CLOSED',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  PUSH: 'PUSH',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  VOICE: 'VOICE',
  WEBHOOK: 'WEBHOOK',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const TelemetrySource = {
  OBD: 'OBD',
  GPS_TRACKER: 'GPS_TRACKER',
  DASHCAM: 'DASHCAM',
  MOBILE_APP: 'MOBILE_APP',
  CAN_BUS: 'CAN_BUS',
  SIMULATION: 'SIMULATION',
} as const;
export type TelemetrySource = (typeof TelemetrySource)[keyof typeof TelemetrySource];

export const ThreatEventType = {
  HOTSPOT_ENTRY: 'HOTSPOT_ENTRY',
  KNOWN_OFFENDER_PROXIMITY: 'KNOWN_OFFENDER_PROXIMITY',
  TAILING_DETECTED: 'TAILING_DETECTED',
  ROUTE_DEVIATION: 'ROUTE_DEVIATION',
  UNUSUAL_STOP: 'UNUSUAL_STOP',
  CROWD_FORMATION: 'CROWD_FORMATION',
  WEAPON_DETECTED: 'WEAPON_DETECTED',
  DURESS_SPEECH: 'DURESS_SPEECH',
  JAMMER_DETECTED: 'JAMMER_DETECTED',
} as const;
export type ThreatEventType = (typeof ThreatEventType)[keyof typeof ThreatEventType];

export const ThreatLevel = {
  MINIMAL: 'MINIMAL',
  GUARDED: 'GUARDED',
  ELEVATED: 'ELEVATED',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE',
} as const;
export type ThreatLevel = (typeof ThreatLevel)[keyof typeof ThreatLevel];

export const AuditAction = {
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  EXPORT: 'EXPORT',
  DISPATCH: 'DISPATCH',
  IMMOBILISE: 'IMMOBILISE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Ordered severity ladder, lowest to highest. Used for sorting and colouring. */
export const SEVERITY_ORDER: readonly IncidentSeverity[] = [
  IncidentSeverity.INFO,
  IncidentSeverity.LOW,
  IncidentSeverity.MEDIUM,
  IncidentSeverity.HIGH,
  IncidentSeverity.CRITICAL,
];

/** Ordered threat ladder, lowest to highest. */
export const THREAT_LEVEL_ORDER: readonly ThreatLevel[] = [
  ThreatLevel.MINIMAL,
  ThreatLevel.GUARDED,
  ThreatLevel.ELEVATED,
  ThreatLevel.HIGH,
  ThreatLevel.SEVERE,
];

/** Incident statuses that still require operator attention. */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.TRIAGED,
  IncidentStatus.ESCALATED,
  IncidentStatus.RESPONDING,
];
