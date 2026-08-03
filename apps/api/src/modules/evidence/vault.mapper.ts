import type {
  EvidenceCustodyEvent as CustodyEventRow,
  EvidenceExportBundle as ExportBundleRow,
  EvidenceSeal as EvidenceSealRow,
} from '@prisma/client';
import type {
  CustodyEvent,
  EvidenceExportBundle,
  EvidenceSeal,
  ExportManifest,
  SignatureStatus,
} from '@aegisdrive/types';

export function toSealDto(row: EvidenceSealRow): EvidenceSeal {
  return {
    id: row.id,
    organizationId: row.organizationId,
    evidenceId: row.evidenceId,
    manifestDigest: row.manifestDigest,
    digestAlgorithm: row.digestAlgorithm,
    signatureStatus: row.signatureStatus as SignatureStatus,
    signature: row.signature,
    signatureAlgorithm: row.signatureAlgorithm,
    signatureKeyId: row.signatureKeyId,
    signerProviderId: row.signerProviderId,
    signedAt: row.signedAt?.toISOString() ?? null,
    sealedAt: row.sealedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCustodyEventDto(row: CustodyEventRow): CustodyEvent {
  return {
    id: row.id,
    evidenceId: row.evidenceId,
    action: row.action,
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    ipAddress: row.ipAddress,
    notes: row.notes,
    prevHash: row.prevHash,
    entryHash: row.entryHash,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export function toExportBundleDto(row: ExportBundleRow): EvidenceExportBundle {
  return {
    id: row.id,
    organizationId: row.organizationId,
    reference: row.reference,
    incidentId: row.incidentId,
    manifest: row.manifest as unknown as ExportManifest,
    manifestDigest: row.manifestDigest,
    signatureStatus: row.signatureStatus as SignatureStatus,
    signature: row.signature,
    signatureAlgorithm: row.signatureAlgorithm,
    signatureKeyId: row.signatureKeyId,
    signerProviderId: row.signerProviderId,
    signedAt: row.signedAt?.toISOString() ?? null,
    itemCount: row.itemCount,
    recipient: row.recipient,
    reason: row.reason,
    format: row.format,
    exportedByUserId: row.exportedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}
