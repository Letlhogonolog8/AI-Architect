-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('OPEN', 'TRACKING', 'LOCATED', 'INTERCEPTING', 'RECOVERED', 'LOST', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TrackSource" AS ENUM ('GPS_TRACKER', 'LICENSE_PLATE_CAMERA', 'CELLULAR', 'AERIAL', 'WITNESS', 'PARTNER_NETWORK', 'MANUAL');

-- CreateEnum
CREATE TYPE "SearchAssignmentStatus" AS ENUM ('ASSIGNED', 'ACKNOWLEDGED', 'SEARCHING', 'DIVERTED', 'STOOD_DOWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GeofenceKind" AS ENUM ('CONTAINMENT', 'EXCLUSION', 'CORRIDOR', 'STAGING', 'ALERT');

-- CreateEnum
CREATE TYPE "GeofenceTrigger" AS ENUM ('ENTER', 'EXIT', 'DWELL', 'ENTER_EXIT');

-- CreateEnum
CREATE TYPE "GeofenceEventType" AS ENUM ('ENTER', 'EXIT', 'DWELL');

-- CreateEnum
CREATE TYPE "DroneObjective" AS ENUM ('LOCATE', 'TRACK', 'CONFIRM', 'OVERWATCH', 'CORRIDOR_SCAN');

-- CreateEnum
CREATE TYPE "DroneTaskStatus" AS ENUM ('REQUESTED', 'UNAVAILABLE', 'ACCEPTED', 'LAUNCHED', 'ON_STATION', 'RETURNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "recovery_cases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "incidentId" UUID,
    "reference" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "IncidentSeverity" NOT NULL DEFAULT 'HIGH',
    "lastKnownLongitude" DOUBLE PRECISION,
    "lastKnownLatitude" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "openedByUserId" UUID,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "recoveredLongitude" DOUBLE PRECISION,
    "recoveredLatitude" DOUBLE PRECISION,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_track_points" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recoveryCaseId" UUID NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "accuracyMetres" DOUBLE PRECISION,
    "source" "TrackSource" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_track_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recoveryCaseId" UUID NOT NULL,
    "searcherVehicleId" UUID,
    "searcherReference" TEXT NOT NULL,
    "status" "SearchAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "sectorCentreLongitude" DOUBLE PRECISION,
    "sectorCentreLatitude" DOUBLE PRECISION,
    "sectorRadiusMetres" INTEGER,
    "assignedByUserId" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "search_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recoveryCaseId" UUID,
    "name" TEXT NOT NULL,
    "kind" "GeofenceKind" NOT NULL,
    "trigger" "GeofenceTrigger" NOT NULL DEFAULT 'ENTER_EXIT',
    "centreLongitude" DOUBLE PRECISION NOT NULL,
    "centreLatitude" DOUBLE PRECISION NOT NULL,
    "radiusMetres" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "geofenceId" UUID NOT NULL,
    "vehicleId" UUID,
    "type" "GeofenceEventType" NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drone_tasks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recoveryCaseId" UUID NOT NULL,
    "droneReference" TEXT NOT NULL,
    "objective" "DroneObjective" NOT NULL,
    "status" "DroneTaskStatus" NOT NULL DEFAULT 'REQUESTED',
    "targetLongitude" DOUBLE PRECISION,
    "targetLatitude" DOUBLE PRECISION,
    "providerId" TEXT,
    "externalReference" TEXT,
    "failureReason" TEXT,
    "requestedByUserId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drone_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_cases_organizationId_status_openedAt_idx" ON "recovery_cases"("organizationId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "recovery_cases_organizationId_openedAt_idx" ON "recovery_cases"("organizationId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "recovery_cases_vehicleId_idx" ON "recovery_cases"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_cases_organizationId_reference_key" ON "recovery_cases"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "recovery_track_points_recoveryCaseId_recordedAt_idx" ON "recovery_track_points"("recoveryCaseId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "recovery_track_points_organizationId_recordedAt_idx" ON "recovery_track_points"("organizationId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "search_assignments_recoveryCaseId_status_idx" ON "search_assignments"("recoveryCaseId", "status");

-- CreateIndex
CREATE INDEX "search_assignments_organizationId_status_idx" ON "search_assignments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "geofences_organizationId_isActive_idx" ON "geofences"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "geofences_recoveryCaseId_idx" ON "geofences"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "geofence_events_geofenceId_occurredAt_idx" ON "geofence_events"("geofenceId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "geofence_events_organizationId_occurredAt_idx" ON "geofence_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "drone_tasks_recoveryCaseId_status_idx" ON "drone_tasks"("recoveryCaseId", "status");

-- CreateIndex
CREATE INDEX "drone_tasks_organizationId_status_idx" ON "drone_tasks"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_track_points" ADD CONSTRAINT "recovery_track_points_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_track_points" ADD CONSTRAINT "recovery_track_points_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_assignments" ADD CONSTRAINT "search_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_assignments" ADD CONSTRAINT "search_assignments_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_assignments" ADD CONSTRAINT "search_assignments_searcherVehicleId_fkey" FOREIGN KEY ("searcherVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "recovery_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drone_tasks" ADD CONSTRAINT "drone_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drone_tasks" ADD CONSTRAINT "drone_tasks_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
