import type { Evidence as EvidenceRow } from '@prisma/client';
import type { Evidence, EvidenceEncryption } from '@aegisdrive/types';

function toEncryption(row: EvidenceRow): EvidenceEncryption | null {
  if (row.encryptionAlgorithm === null || row.encryptionKeyId === null) return null;
  return {
    algorithm: row.encryptionAlgorithm,
    keyId: row.encryptionKeyId,
    wrappedDataKey: row.wrappedDataKey ?? '',
    iv: row.encryptionIv,
  };
}

export function toEvidenceDto(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    incidentId: row.incidentId,
    vehicleId: row.vehicleId,
    type: row.type,
    status: row.status,
    label: row.label,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    // BigInt cannot be JSON-serialised. File sizes stay well inside Number's
    // safe integer range, so the narrowing is lossless in practice.
    sizeBytes: Number(row.sizeBytes),
    durationSeconds: row.durationSeconds,
    checksum: row.checksum,
    capturedAt: row.capturedAt.toISOString(),
    sealedAt: row.sealedAt?.toISOString() ?? null,
    uploadedByUserId: row.uploadedByUserId,
    encryption: toEncryption(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
