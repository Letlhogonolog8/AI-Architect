-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'OPERATOR', 'SECURITY', 'POLICE', 'DRIVER', 'ANALYST');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "OrganizationTier" AS ENUM ('PILOT', 'STANDARD', 'ENTERPRISE', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'BAKKIE', 'VAN', 'TRUCK', 'BUS', 'MOTORCYCLE', 'ARMOURED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'IDLE', 'IN_TRANSIT', 'UNDER_THREAT', 'IMMOBILISED', 'STOLEN', 'RECOVERED', 'MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "ProtectionMode" AS ENUM ('PASSIVE', 'GUARDIAN', 'SENTINEL', 'ESCORT');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ON_DUTY', 'OFF_DUTY', 'DRIVING', 'RESTING', 'DISTRESS', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('HIJACKING', 'ATTEMPTED_HIJACKING', 'THEFT', 'KIDNAPPING', 'COERCION', 'SMASH_AND_GRAB', 'UNAUTHORISED_USE', 'PANIC_ACTIVATION', 'GEOFENCE_BREACH', 'COLLISION', 'MEDICAL');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'TRIAGED', 'ESCALATED', 'RESPONDING', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('VIDEO', 'AUDIO', 'IMAGE', 'TELEMETRY_SNAPSHOT', 'DOCUMENT', 'AI_INFERENCE', 'SYSTEM_LOG');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADING', 'SEALED', 'VERIFIED', 'CORRUPTED', 'PURGED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PANIC', 'ANOMALY', 'PREDICTIVE_RISK', 'GEOFENCE', 'DEVICE_TAMPER', 'SIGNAL_LOSS', 'DRIVER_BEHAVIOUR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SUPPRESSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'SMS', 'EMAIL', 'VOICE', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('OBD', 'GPS_TRACKER', 'DASHCAM', 'MOBILE_APP', 'CAN_BUS', 'SIMULATION');

-- CreateEnum
CREATE TYPE "ThreatEventType" AS ENUM ('HOTSPOT_ENTRY', 'KNOWN_OFFENDER_PROXIMITY', 'TAILING_DETECTED', 'ROUTE_DEVIATION', 'UNUSUAL_STOP', 'CROWD_FORMATION', 'WEAPON_DETECTED', 'DURESS_SPEECH', 'JAMMER_DETECTED');

-- CreateEnum
CREATE TYPE "ThreatLevel" AS ENUM ('MINIMAL', 'GUARDED', 'ELEVATED', 'HIGH', 'SEVERE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'TOKEN_REFRESH', 'PERMISSION_DENIED', 'EXPORT', 'DISPATCH', 'IMMOBILISE');

-- CreateEnum
CREATE TYPE "IdentityModality" AS ENUM ('FACE', 'VOICE', 'DEVICE', 'BEHAVIOUR', 'INTERACTION', 'EXPLICIT');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('PENDING', 'CAPTURING', 'ACTIVE', 'WITHDRAWN', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConsentBasis" AS ENUM ('EXPLICIT_CONSENT', 'CONTRACT', 'VITAL_INTERESTS');

-- CreateEnum
CREATE TYPE "IdentityBand" AS ENUM ('VERIFIED', 'PROBABLE', 'UNCERTAIN', 'SUSPECT', 'IMPOSTOR');

-- CreateEnum
CREATE TYPE "DeviceAttestation" AS ENUM ('VERIFIED', 'UNVERIFIED', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "CameraPlacement" AS ENUM ('DRIVER_FACING', 'CABIN_WIDE', 'REAR_CABIN', 'CARGO');

-- CreateEnum
CREATE TYPE "SensorHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'IMPAIRED', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TamperState" AS ENUM ('CLEAR', 'OBSTRUCTED', 'BLINDED', 'MISALIGNED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "WeaponVerdict" AS ENUM ('CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ThreatHypothesis" AS ENUM ('NORMAL', 'SENSOR_FAILURE', 'UNAUTHORISED_USE', 'COLLISION', 'HIJACKING', 'THEFT', 'MEDICAL', 'DURESS');

-- CreateEnum
CREATE TYPE "HazardSource" AS ENUM ('CONFIRMED_INCIDENT', 'POLICE_STATISTICS', 'PARTNER_FEED', 'ROAD_AUTHORITY', 'MANUAL_ASSESSMENT');

-- CreateEnum
CREATE TYPE "SafeHavenKind" AS ENUM ('POLICE_STATION', 'HOSPITAL', 'FUEL_STATION', 'SECURITY_BASE', 'OWN_PREMISES', 'PUBLIC_SECURE_SITE');

-- CreateEnum
CREATE TYPE "RiskAversion" AS ENUM ('LOW', 'STANDARD', 'HIGH');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tier" "OrganizationTier" NOT NULL DEFAULT 'PILOT',
    "countryCode" CHAR(2) NOT NULL DEFAULT 'ZA',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permissions" TEXT[],
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "colour" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IDLE',
    "protectionMode" "ProtectionMode" NOT NULL DEFAULT 'GUARDIAN',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "threatLevel" "ThreatLevel" NOT NULL DEFAULT 'MINIMAL',
    "lastLongitude" DOUBLE PRECISION,
    "lastLatitude" DOUBLE PRECISION,
    "lastHeading" DOUBLE PRECISION,
    "lastSpeedKph" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "odometerKm" INTEGER NOT NULL DEFAULT 0,
    "deviceSerial" TEXT,
    "assignedDriverId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "licenceExpiresAt" TIMESTAMP(3),
    "phoneNumber" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFF_DUTY',
    "safetyScore" INTEGER NOT NULL DEFAULT 100,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "assignedToUserId" UUID,
    "aiConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline_entries" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorUserId" UUID,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID,
    "vehicleId" UUID,
    "type" "EvidenceType" NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "checksum" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sealedAt" TIMESTAMP(3),
    "uploadedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_custody_events" (
    "id" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" UUID,
    "actorEmail" TEXT,
    "ipAddress" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_custody_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "IncidentSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "incidentId" UUID,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "alertId" UUID,
    "incidentId" UUID,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "source" "TelemetrySource" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "ignitionOn" BOOLEAN NOT NULL DEFAULT false,
    "fuelLevelPercent" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "engineTempC" DOUBLE PRECISION,
    "harshBraking" BOOLEAN NOT NULL DEFAULT false,
    "harshAcceleration" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threat_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID,
    "incidentId" UUID,
    "type" "ThreatEventType" NOT NULL,
    "level" "ThreatLevel" NOT NULL,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threat_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threat_zones" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" "ThreatLevel" NOT NULL,
    "centreLongitude" DOUBLE PRECISION NOT NULL,
    "centreLatitude" DOUBLE PRECISION NOT NULL,
    "radiusMetres" INTEGER NOT NULL,
    "activeFromHour" SMALLINT,
    "activeToHour" SMALLINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threat_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "actorEmail" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_enrolments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID,
    "occupantId" UUID,
    "modality" "IdentityModality" NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "templateRef" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "enrolmentQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consentBasis" "ConsentBasis" NOT NULL,
    "consentRecordedAt" TIMESTAMP(3) NOT NULL,
    "consentWithdrawnAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolled_occupants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "consentBasis" "ConsentBasis" NOT NULL DEFAULT 'EXPLICIT_CONSENT',
    "consentRecordedAt" TIMESTAMP(3) NOT NULL,
    "consentWithdrawnAt" TIMESTAMP(3),
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrolled_occupants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_assessments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID,
    "vehicleId" UUID,
    "confidence" INTEGER NOT NULL,
    "band" "IdentityBand" NOT NULL,
    "fusedLogLikelihoodRatio" DOUBLE PRECISION NOT NULL,
    "contributions" JSONB NOT NULL,
    "missingModalities" JSONB NOT NULL,
    "spoofDetected" BOOLEAN NOT NULL DEFAULT false,
    "occupantCount" INTEGER,
    "unrecognisedCount" INTEGER,
    "expectedCount" INTEGER,
    "unexpectedOccupancy" BOOLEAN NOT NULL DEFAULT false,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policyVersion" TEXT NOT NULL,

    CONSTRAINT "identity_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_challenges" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_fingerprints" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID,
    "installationId" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "attestation" "DeviceAttestation" NOT NULL DEFAULT 'UNSUPPORTED',
    "compromised" BOOLEAN NOT NULL DEFAULT false,
    "emulated" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_baselines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "modelId" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "observedMinutes" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL,
    "distinctiveness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_assessments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID,
    "vehicleId" UUID,
    "threatScore" INTEGER NOT NULL,
    "threatLevel" "ThreatLevel" NOT NULL,
    "positivePredictiveValue" DOUBLE PRECISION NOT NULL,
    "baseRatePerTripHour" DOUBLE PRECISION NOT NULL,
    "logLikelihoodRatio" DOUBLE PRECISION NOT NULL,
    "contributions" JSONB NOT NULL,
    "corroboratingClasses" JSONB NOT NULL,
    "corroborationCapped" BOOLEAN NOT NULL DEFAULT false,
    "capReason" TEXT,
    "arousalIndex" DOUBLE PRECISION,
    "arousalConfidence" DOUBLE PRECISION,
    "abnormalityScore" DOUBLE PRECISION,
    "occupantCount" INTEGER,
    "expectedCount" INTEGER,
    "speakerCount" INTEGER,
    "identityBand" "IdentityBand",
    "signals" JSONB NOT NULL,
    "duressIndicated" BOOLEAN NOT NULL DEFAULT false,
    "duressConfidence" DOUBLE PRECISION,
    "duressDeliberate" BOOLEAN NOT NULL DEFAULT false,
    "duressBasis" JSONB,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policyVersion" TEXT NOT NULL,
    "calibrationSource" TEXT NOT NULL,

    CONSTRAINT "behaviour_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabin_baselines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "modelId" TEXT NOT NULL,
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "observedMinutes" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cabin_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabin_sensors" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placement" "CameraPlacement" NOT NULL,
    "audioOnly" BOOLEAN NOT NULL DEFAULT false,
    "health" "SensorHealth" NOT NULL DEFAULT 'UNKNOWN',
    "tamper" "TamperState" NOT NULL DEFAULT 'CLEAR',
    "meanQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "analysisEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recordingIndicatorFitted" BOOLEAN NOT NULL,
    "firmwareVersion" TEXT NOT NULL,
    "lastFrameAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabin_sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabin_detections" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "sensorId" UUID,
    "objects" JSONB NOT NULL,
    "occupantCount" INTEGER,
    "stableCount" INTEGER,
    "expectedCount" INTEGER,
    "seats" JSONB,
    "unobservedSeats" JSONB,
    "acousticEvents" JSONB,
    "weaponCandidateClass" TEXT,
    "weaponConfidence" DOUBLE PRECISION,
    "weaponPpv" DOUBLE PRECISION,
    "weaponBaseRate" DOUBLE PRECISION,
    "weaponCaveats" JSONB,
    "weaponCorroborated" BOOLEAN NOT NULL DEFAULT false,
    "weaponVerdict" "WeaponVerdict",
    "weaponVerifiedById" UUID,
    "weaponVerifiedAt" TIMESTAMP(3),
    "degradedSensors" JSONB,
    "windowSeconds" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pipelineVersion" TEXT NOT NULL,

    CONSTRAINT "cabin_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threat_decisions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "leadingHypothesis" "ThreatHypothesis" NOT NULL,
    "anomalyProbability" DOUBLE PRECISION NOT NULL,
    "hypothesisConfidence" DOUBLE PRECISION NOT NULL,
    "posteriors" JSONB NOT NULL,
    "confidenceOverall" DOUBLE PRECISION NOT NULL,
    "confidenceDetail" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "autonomyLevel" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "constraints" JSONB NOT NULL,
    "graph" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineVersion" TEXT NOT NULL,
    "calibrationSource" TEXT NOT NULL,
    "overrideHypothesis" "ThreatHypothesis",
    "overrideReason" TEXT,
    "overrideByUserId" UUID,
    "overrideAt" TIMESTAMP(3),

    CONSTRAINT "threat_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_segments" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "externalRef" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "lengthMetres" INTEGER NOT NULL,
    "freeFlowSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_hazards" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "segmentId" UUID NOT NULL,
    "incidentType" "IncidentType" NOT NULL,
    "ratePerMillionVehicleHours" DOUBLE PRECISION NOT NULL,
    "activeFromHour" SMALLINT,
    "activeToHour" SMALLINT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "exposureVehicleHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "HazardSource" NOT NULL,
    "reportingBiasPossible" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segment_hazards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safe_havens" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "SafeHavenKind" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "isTwentyFourHour" BOOLEAN NOT NULL DEFAULT false,
    "openFromHour" SMALLINT,
    "openToHour" SMALLINT,
    "hasArmedSecurity" BOOLEAN NOT NULL DEFAULT false,
    "hasCctv" BOOLEAN NOT NULL DEFAULT false,
    "hasLighting" BOOLEAN NOT NULL DEFAULT false,
    "hasStandingArrangement" BOOLEAN NOT NULL DEFAULT false,
    "contactNumber" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safe_havens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_plans" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "chosen" JSONB NOT NULL,
    "rejected" JSONB NOT NULL,
    "totalTransitSeconds" INTEGER NOT NULL,
    "expectedIncidents" DOUBLE PRECISION NOT NULL,
    "detourSeconds" INTEGER NOT NULL DEFAULT 0,
    "riskReduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskAversion" "RiskAversion" NOT NULL DEFAULT 'STANDARD',
    "riskAversionMinutesPerIncident" INTEGER NOT NULL,
    "rationale" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departAt" TIMESTAMP(3) NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "hazardCalibrationSource" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "supersededByPlanId" UUID,
    "supersededReason" TEXT,

    CONSTRAINT "route_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_equity_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "routePlanId" UUID NOT NULL,
    "destinationCell" TEXT NOT NULL,
    "baselineSeconds" INTEGER NOT NULL,
    "chosenSeconds" INTEGER NOT NULL,
    "detourSecondsAttributable" INTEGER NOT NULL,
    "riskReduction" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_equity_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "police_route_shares" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "routePlanId" UUID,
    "recipientReference" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "grantedByUserId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" UUID,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "police_route_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_isActive_idx" ON "organizations"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "users_organizationId_status_idx" ON "users"("organizationId", "status");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_assignedDriverId_key" ON "vehicles"("assignedDriverId");

-- CreateIndex
CREATE INDEX "vehicles_organizationId_status_idx" ON "vehicles"("organizationId", "status");

-- CreateIndex
CREATE INDEX "vehicles_organizationId_threatLevel_idx" ON "vehicles"("organizationId", "threatLevel");

-- CreateIndex
CREATE INDEX "vehicles_deviceSerial_idx" ON "vehicles"("deviceSerial");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_registrationNumber_key" ON "vehicles"("organizationId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organizationId_vin_key" ON "vehicles"("organizationId", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_organizationId_status_idx" ON "drivers"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_organizationId_licenceNumber_key" ON "drivers"("organizationId", "licenceNumber");

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_severity_idx" ON "incidents"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "incidents_organizationId_detectedAt_idx" ON "incidents"("organizationId", "detectedAt");

-- CreateIndex
CREATE INDEX "incidents_vehicleId_idx" ON "incidents"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organizationId_reference_key" ON "incidents"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "incident_timeline_entries_incidentId_occurredAt_idx" ON "incident_timeline_entries"("incidentId", "occurredAt");

-- CreateIndex
CREATE INDEX "evidence_organizationId_status_idx" ON "evidence"("organizationId", "status");

-- CreateIndex
CREATE INDEX "evidence_incidentId_idx" ON "evidence"("incidentId");

-- CreateIndex
CREATE INDEX "evidence_checksum_idx" ON "evidence"("checksum");

-- CreateIndex
CREATE INDEX "evidence_custody_events_evidenceId_occurredAt_idx" ON "evidence_custody_events"("evidenceId", "occurredAt");

-- CreateIndex
CREATE INDEX "alerts_organizationId_status_raisedAt_idx" ON "alerts"("organizationId", "status", "raisedAt");

-- CreateIndex
CREATE INDEX "alerts_vehicleId_idx" ON "alerts"("vehicleId");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_status_createdAt_idx" ON "notifications"("recipientUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "telemetry_vehicleId_recordedAt_idx" ON "telemetry"("vehicleId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "telemetry_organizationId_recordedAt_idx" ON "telemetry"("organizationId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "threat_events_organizationId_detectedAt_idx" ON "threat_events"("organizationId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "threat_events_organizationId_level_acknowledged_idx" ON "threat_events"("organizationId", "level", "acknowledged");

-- CreateIndex
CREATE INDEX "threat_events_vehicleId_idx" ON "threat_events"("vehicleId");

-- CreateIndex
CREATE INDEX "threat_zones_organizationId_isActive_idx" ON "threat_zones"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "identity_enrolments_organizationId_status_idx" ON "identity_enrolments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "identity_enrolments_driverId_modality_idx" ON "identity_enrolments"("driverId", "modality");

-- CreateIndex
CREATE INDEX "identity_enrolments_occupantId_idx" ON "identity_enrolments"("occupantId");

-- CreateIndex
CREATE INDEX "identity_enrolments_expiresAt_idx" ON "identity_enrolments"("expiresAt");

-- CreateIndex
CREATE INDEX "enrolled_occupants_organizationId_status_idx" ON "enrolled_occupants"("organizationId", "status");

-- CreateIndex
CREATE INDEX "identity_assessments_organizationId_assessedAt_idx" ON "identity_assessments"("organizationId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "identity_assessments_driverId_assessedAt_idx" ON "identity_assessments"("driverId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "identity_assessments_organizationId_band_idx" ON "identity_assessments"("organizationId", "band");

-- CreateIndex
CREATE INDEX "identity_challenges_organizationId_status_idx" ON "identity_challenges"("organizationId", "status");

-- CreateIndex
CREATE INDEX "identity_challenges_driverId_issuedAt_idx" ON "identity_challenges"("driverId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "device_fingerprints_organizationId_driverId_idx" ON "device_fingerprints"("organizationId", "driverId");

-- CreateIndex
CREATE INDEX "device_fingerprints_fingerprintHash_idx" ON "device_fingerprints"("fingerprintHash");

-- CreateIndex
CREATE UNIQUE INDEX "device_fingerprints_organizationId_installationId_key" ON "device_fingerprints"("organizationId", "installationId");

-- CreateIndex
CREATE INDEX "behaviour_baselines_organizationId_status_idx" ON "behaviour_baselines"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "behaviour_baselines_driverId_modelId_key" ON "behaviour_baselines"("driverId", "modelId");

-- CreateIndex
CREATE INDEX "behaviour_assessments_organizationId_assessedAt_idx" ON "behaviour_assessments"("organizationId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "behaviour_assessments_driverId_assessedAt_idx" ON "behaviour_assessments"("driverId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "behaviour_assessments_organizationId_threatLevel_idx" ON "behaviour_assessments"("organizationId", "threatLevel");

-- CreateIndex
CREATE INDEX "behaviour_assessments_organizationId_duressIndicated_idx" ON "behaviour_assessments"("organizationId", "duressIndicated");

-- CreateIndex
CREATE INDEX "cabin_baselines_organizationId_status_idx" ON "cabin_baselines"("organizationId", "status");

-- CreateIndex
CREATE INDEX "cabin_baselines_expiresAt_idx" ON "cabin_baselines"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cabin_baselines_driverId_modelId_key" ON "cabin_baselines"("driverId", "modelId");

-- CreateIndex
CREATE INDEX "cabin_sensors_organizationId_vehicleId_idx" ON "cabin_sensors"("organizationId", "vehicleId");

-- CreateIndex
CREATE INDEX "cabin_sensors_organizationId_health_idx" ON "cabin_sensors"("organizationId", "health");

-- CreateIndex
CREATE UNIQUE INDEX "cabin_sensors_organizationId_serialNumber_key" ON "cabin_sensors"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "cabin_detections_organizationId_capturedAt_idx" ON "cabin_detections"("organizationId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "cabin_detections_vehicleId_capturedAt_idx" ON "cabin_detections"("vehicleId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "cabin_detections_organizationId_weaponVerdict_idx" ON "cabin_detections"("organizationId", "weaponVerdict");

-- CreateIndex
CREATE INDEX "threat_decisions_organizationId_decidedAt_idx" ON "threat_decisions"("organizationId", "decidedAt" DESC);

-- CreateIndex
CREATE INDEX "threat_decisions_vehicleId_decidedAt_idx" ON "threat_decisions"("vehicleId", "decidedAt" DESC);

-- CreateIndex
CREATE INDEX "threat_decisions_organizationId_leadingHypothesis_idx" ON "threat_decisions"("organizationId", "leadingHypothesis");

-- CreateIndex
CREATE INDEX "threat_decisions_organizationId_overrideHypothesis_idx" ON "threat_decisions"("organizationId", "overrideHypothesis");

-- CreateIndex
CREATE INDEX "road_segments_organizationId_idx" ON "road_segments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "road_segments_externalRef_key" ON "road_segments"("externalRef");

-- CreateIndex
CREATE INDEX "segment_hazards_segmentId_incidentType_idx" ON "segment_hazards"("segmentId", "incidentType");

-- CreateIndex
CREATE INDEX "segment_hazards_organizationId_confidence_idx" ON "segment_hazards"("organizationId", "confidence");

-- CreateIndex
CREATE INDEX "safe_havens_organizationId_isActive_idx" ON "safe_havens"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "safe_havens_organizationId_kind_idx" ON "safe_havens"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "route_plans_organizationId_plannedAt_idx" ON "route_plans"("organizationId", "plannedAt" DESC);

-- CreateIndex
CREATE INDEX "route_plans_vehicleId_plannedAt_idx" ON "route_plans"("vehicleId", "plannedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "routing_equity_records_routePlanId_key" ON "routing_equity_records"("routePlanId");

-- CreateIndex
CREATE INDEX "routing_equity_records_organizationId_destinationCell_idx" ON "routing_equity_records"("organizationId", "destinationCell");

-- CreateIndex
CREATE INDEX "routing_equity_records_organizationId_recordedAt_idx" ON "routing_equity_records"("organizationId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "police_route_shares_organizationId_expiresAt_idx" ON "police_route_shares"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "police_route_shares_incidentId_idx" ON "police_route_shares"("incidentId");

-- CreateIndex
CREATE INDEX "police_route_shares_vehicleId_grantedAt_idx" ON "police_route_shares"("vehicleId", "grantedAt" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_custody_events" ADD CONSTRAINT "evidence_custody_events_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_events" ADD CONSTRAINT "threat_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_events" ADD CONSTRAINT "threat_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_events" ADD CONSTRAINT "threat_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_enrolments" ADD CONSTRAINT "identity_enrolments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_enrolments" ADD CONSTRAINT "identity_enrolments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_enrolments" ADD CONSTRAINT "identity_enrolments_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "enrolled_occupants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolled_occupants" ADD CONSTRAINT "enrolled_occupants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_assessments" ADD CONSTRAINT "identity_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_assessments" ADD CONSTRAINT "identity_assessments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_assessments" ADD CONSTRAINT "identity_assessments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_challenges" ADD CONSTRAINT "identity_challenges_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_challenges" ADD CONSTRAINT "identity_challenges_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "identity_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_baselines" ADD CONSTRAINT "behaviour_baselines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_baselines" ADD CONSTRAINT "behaviour_baselines_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_assessments" ADD CONSTRAINT "behaviour_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_assessments" ADD CONSTRAINT "behaviour_assessments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_assessments" ADD CONSTRAINT "behaviour_assessments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_baselines" ADD CONSTRAINT "cabin_baselines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_baselines" ADD CONSTRAINT "cabin_baselines_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_sensors" ADD CONSTRAINT "cabin_sensors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_sensors" ADD CONSTRAINT "cabin_sensors_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_detections" ADD CONSTRAINT "cabin_detections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_detections" ADD CONSTRAINT "cabin_detections_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabin_detections" ADD CONSTRAINT "cabin_detections_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "cabin_sensors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_decisions" ADD CONSTRAINT "threat_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_decisions" ADD CONSTRAINT "threat_decisions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_decisions" ADD CONSTRAINT "threat_decisions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_hazards" ADD CONSTRAINT "segment_hazards_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "road_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safe_havens" ADD CONSTRAINT "safe_havens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_equity_records" ADD CONSTRAINT "routing_equity_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_equity_records" ADD CONSTRAINT "routing_equity_records_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "route_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "police_route_shares" ADD CONSTRAINT "police_route_shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "police_route_shares" ADD CONSTRAINT "police_route_shares_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "police_route_shares" ADD CONSTRAINT "police_route_shares_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "route_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
