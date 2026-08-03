import type {
  EvidenceManifest,
  EvidenceType,
  ExportManifest,
  ExportManifestItem,
} from '@aegisdrive/types';
import { canonicalize } from './canonical';
import { COURT_BUNDLE_FORMAT, MANIFEST_VERSION } from './policy';

/**
 * Manifest construction for the things the vault hashes and signs.
 *
 * Every builder here is pure and produces the exact object that will be fed to
 * `canonicalize` and then hashed. Keeping construction in one place, shared by
 * the writer and the verifier, is what guarantees the digest computed at seal
 * time and the one recomputed at verify time are over identical bytes.
 */

export interface EvidenceManifestInput {
  evidenceId: string;
  organizationId: string;
  type: EvidenceType;
  label: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  capturedAt: string;
  storageKey: string;
  encryption: { algorithm: string; keyId: string } | null;
}

export function buildEvidenceManifest(input: EvidenceManifestInput): EvidenceManifest {
  return {
    version: MANIFEST_VERSION,
    evidenceId: input.evidenceId,
    organizationId: input.organizationId,
    type: input.type,
    label: input.label,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
    capturedAt: input.capturedAt,
    storageKey: input.storageKey,
    encryption: input.encryption,
  };
}

/** The canonical string a manifest is hashed over. */
export function manifestPayload(manifest: EvidenceManifest): string {
  return canonicalize(manifest);
}

// ---------------------------------------------------------------- custody

export interface CustodyPayloadInput {
  prevHash: string | null;
  evidenceId: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  notes: string | null;
  occurredAt: string;
}

/**
 * The canonical string one custody link is hashed over.
 *
 * `prevHash` is inside the payload deliberately: it is what chains the link to
 * the one before it, so recomputing this event's hash requires the previous
 * event's hash to be exactly what it was, and altering any earlier event
 * cascades a mismatch forward through every later one.
 */
export function custodyPayload(input: CustodyPayloadInput): string {
  return canonicalize({
    prevHash: input.prevHash,
    evidenceId: input.evidenceId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    ipAddress: input.ipAddress,
    notes: input.notes,
    occurredAt: input.occurredAt,
  });
}

// ----------------------------------------------------------------- export

export interface ExportManifestInput {
  organizationId: string;
  incidentReference: string | null;
  recipient: string;
  reason: string;
  generatedAt: string;
  items: ExportManifestItem[];
}

export function buildExportManifest(input: ExportManifestInput): ExportManifest {
  return {
    format: COURT_BUNDLE_FORMAT,
    version: MANIFEST_VERSION,
    generatedAt: input.generatedAt,
    organizationId: input.organizationId,
    incidentReference: input.incidentReference,
    recipient: input.recipient,
    reason: input.reason,
    items: input.items,
  };
}

export function exportManifestPayload(manifest: ExportManifest): string {
  return canonicalize(manifest);
}
