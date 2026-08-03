import type { Prisma } from '@prisma/client';
import type { PaginationQuery, SignatureStatus } from '@aegisdrive/types';
import { EXPORT_REFERENCE_PREFIX, toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

// ------------------------------------------------------------------- seals

export interface SealWriteInput {
  manifestDigest: string;
  signatureStatus: SignatureStatus;
  signature: string | null;
  signatureAlgorithm: string | null;
  signatureKeyId: string | null;
  signerProviderId: string | null;
  signedAt: Date | null;
  sealedAt: Date;
}

/**
 * Writes the seal for an artefact, keyed on its (unique) evidence id.
 *
 * Upsert rather than insert so a re-signature after key rotation replaces the
 * signature block over the same manifest digest, without a second row. The
 * digest itself never changes — if it did, the artefact would be a different
 * artefact.
 */
export async function upsertSeal(
  organizationId: string,
  evidenceId: string,
  input: SealWriteInput,
) {
  return prisma.evidenceSeal.upsert({
    where: { evidenceId },
    create: {
      organizationId,
      evidenceId,
      manifestDigest: input.manifestDigest,
      signatureStatus: input.signatureStatus,
      signature: input.signature,
      signatureAlgorithm: input.signatureAlgorithm,
      signatureKeyId: input.signatureKeyId,
      signerProviderId: input.signerProviderId,
      signedAt: input.signedAt,
      sealedAt: input.sealedAt,
    },
    update: {
      signatureStatus: input.signatureStatus,
      signature: input.signature,
      signatureAlgorithm: input.signatureAlgorithm,
      signatureKeyId: input.signatureKeyId,
      signerProviderId: input.signerProviderId,
      signedAt: input.signedAt,
    },
  });
}

export async function findSealByEvidenceId(organizationId: string, evidenceId: string) {
  return prisma.evidenceSeal.findFirst({ where: { organizationId, evidenceId } });
}

export async function updateSealSignature(
  organizationId: string,
  evidenceId: string,
  data: Prisma.EvidenceSealUpdateInput,
) {
  const result = await prisma.evidenceSeal.updateMany({
    where: { organizationId, evidenceId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.evidenceSeal.findFirst({ where: { organizationId, evidenceId } });
}

// ---------------------------------------------------------- export bundles

export async function insertExportBundle(
  organizationId: string,
  data: Omit<Prisma.EvidenceExportBundleCreateInput, 'organization'>,
) {
  return prisma.evidenceExportBundle.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

export async function findExportBundleById(organizationId: string, bundleId: string) {
  return prisma.evidenceExportBundle.findFirst({ where: { id: bundleId, organizationId } });
}

export interface ExportBundleFilter extends PaginationQuery {
  organizationId: string;
  incidentId?: string;
}

export async function findExportBundles(filter: ExportBundleFilter) {
  const where: Prisma.EvidenceExportBundleWhereInput = {
    organizationId: filter.organizationId,
    incidentId: filter.incidentId,
  };
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.evidenceExportBundle.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.evidenceExportBundle.count({ where }),
  ]);

  return { rows, total };
}

// ------------------------------------------------------------- replay reads

/** Every artefact attached to an incident, for the timeline replay. */
export async function findEvidenceByIncident(organizationId: string, incidentId: string) {
  return prisma.evidence.findMany({
    where: { organizationId, incidentId },
    orderBy: { capturedAt: 'asc' },
  });
}

/** Every threat event on an incident, for the timeline replay. */
export async function findThreatEventsByIncident(organizationId: string, incidentId: string) {
  return prisma.threatEvent.findMany({
    where: { organizationId, incidentId },
    orderBy: { detectedAt: 'asc' },
  });
}

/**
 * Allocates the next per-tenant, per-year export reference (`EXP-2026-000017`).
 *
 * Serialisable, like the incident and recovery allocators, so two exports minted
 * in the same millisecond cannot collide.
 */
export async function allocateExportReference(organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${EXPORT_REFERENCE_PREFIX}-${year}-`;

  return prisma.$transaction(
    async (tx) => {
      const latest = await tx.evidenceExportBundle.findFirst({
        where: { organizationId, reference: { startsWith: prefix } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });

      const lastSequence = latest ? Number.parseInt(latest.reference.slice(prefix.length), 10) : 0;
      const next = Number.isNaN(lastSequence) ? 1 : lastSequence + 1;

      return `${prefix}${String(next).padStart(6, '0')}`;
    },
    { isolationLevel: 'Serializable' },
  );
}
