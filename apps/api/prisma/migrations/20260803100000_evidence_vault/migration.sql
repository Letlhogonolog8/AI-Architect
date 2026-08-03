-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('UNSIGNED', 'SIGNED', 'INVALID');

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN "encryptionAlgorithm" TEXT,
ADD COLUMN "encryptionKeyId" TEXT,
ADD COLUMN "wrappedDataKey" TEXT,
ADD COLUMN "encryptionIv" TEXT;

-- AlterTable
ALTER TABLE "evidence_custody_events" ADD COLUMN "prevHash" TEXT,
ADD COLUMN "entryHash" TEXT;

-- CreateTable
CREATE TABLE "evidence_seals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "manifestDigest" TEXT NOT NULL,
    "digestAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'UNSIGNED',
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "signatureKeyId" TEXT,
    "signerProviderId" TEXT,
    "signedAt" TIMESTAMP(3),
    "sealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_seals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_export_bundles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID,
    "reference" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "manifestDigest" TEXT NOT NULL,
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'UNSIGNED',
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "signatureKeyId" TEXT,
    "signerProviderId" TEXT,
    "signedAt" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "exportedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_export_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_seals_evidenceId_key" ON "evidence_seals"("evidenceId");

-- CreateIndex
CREATE INDEX "evidence_seals_organizationId_signatureStatus_idx" ON "evidence_seals"("organizationId", "signatureStatus");

-- CreateIndex
CREATE INDEX "evidence_export_bundles_organizationId_createdAt_idx" ON "evidence_export_bundles"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "evidence_export_bundles_incidentId_idx" ON "evidence_export_bundles"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_export_bundles_organizationId_reference_key" ON "evidence_export_bundles"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "evidence_seals" ADD CONSTRAINT "evidence_seals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_seals" ADD CONSTRAINT "evidence_seals_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_export_bundles" ADD CONSTRAINT "evidence_export_bundles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_export_bundles" ADD CONSTRAINT "evidence_export_bundles_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
