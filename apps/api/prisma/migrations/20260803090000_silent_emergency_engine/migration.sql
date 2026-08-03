-- CreateEnum
CREATE TYPE "SosActivationMethod" AS ENUM ('HIDDEN_BUTTON', 'DURESS_PIN', 'DURESS_PHRASE', 'POWER_BUTTON_SEQUENCE', 'APP_GESTURE', 'WEARABLE', 'DEADMAN', 'DECISION_ENGINE');

-- CreateEnum
CREATE TYPE "SosStatus" AS ENUM ('ACTIVATED', 'DISPATCHING', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED', 'FALSE_ALARM');

-- CreateEnum
CREATE TYPE "EmergencyChannel" AS ENUM ('POLICE', 'PRIVATE_SECURITY', 'FAMILY', 'INSURANCE');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'ACKNOWLEDGED', 'FAILED', 'UNCONFIGURED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sos_activations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "method" "SosActivationMethod" NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'ACTIVATED',
    "covert" BOOLEAN NOT NULL DEFAULT true,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "incidentId" UUID,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "dispositionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sos_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_dispatches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "activationId" UUID NOT NULL,
    "channel" "EmergencyChannel" NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "recipientReference" TEXT NOT NULL,
    "recipientContact" TEXT,
    "providerId" TEXT,
    "externalReference" TEXT,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sos_activations_organizationId_status_activatedAt_idx" ON "sos_activations"("organizationId", "status", "activatedAt" DESC);

-- CreateIndex
CREATE INDEX "sos_activations_organizationId_activatedAt_idx" ON "sos_activations"("organizationId", "activatedAt" DESC);

-- CreateIndex
CREATE INDEX "sos_activations_vehicleId_activatedAt_idx" ON "sos_activations"("vehicleId", "activatedAt" DESC);

-- CreateIndex
CREATE INDEX "sos_activations_organizationId_method_idx" ON "sos_activations"("organizationId", "method");

-- CreateIndex
CREATE INDEX "emergency_dispatches_organizationId_status_idx" ON "emergency_dispatches"("organizationId", "status");

-- CreateIndex
CREATE INDEX "emergency_dispatches_activationId_idx" ON "emergency_dispatches"("activationId");

-- CreateIndex
CREATE INDEX "emergency_dispatches_organizationId_channel_idx" ON "emergency_dispatches"("organizationId", "channel");

-- AddForeignKey
ALTER TABLE "sos_activations" ADD CONSTRAINT "sos_activations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_activations" ADD CONSTRAINT "sos_activations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_activations" ADD CONSTRAINT "sos_activations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_activations" ADD CONSTRAINT "sos_activations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_dispatches" ADD CONSTRAINT "emergency_dispatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_dispatches" ADD CONSTRAINT "emergency_dispatches_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "sos_activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
