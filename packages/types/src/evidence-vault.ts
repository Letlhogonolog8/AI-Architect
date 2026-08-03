import type { ISODateString, TenantScoped, UUID } from './common';
import type { EvidenceType } from './enums';

/**
 * Evidence Vault.
 *
 * The existing evidence subsystem already gives an artefact a SHA-256 checksum,
 * a sealed state and an append-only chain of custody. The vault adds the layers
 * that make a sealed artefact defensible in a courtroom rather than merely
 * intact on a disk:
 *
 *  - a **tamper-evident custody ledger** — each event carries the hash of the
 *    one before it, so a removed or altered link breaks the chain visibly;
 *  - a **cryptographic seal** — a signed digest over the artefact's manifest,
 *    binding its identity, type, size and checksum together under one signature;
 *  - **envelope-encryption metadata** — a record that the bytes are encrypted at
 *    rest under a KMS-wrapped key the platform never holds in plaintext;
 *  - a **court-export bundle** — a single signed manifest listing every artefact
 *    disclosed together, with each one's digest and custody summary;
 *  - a **timeline replay** — the incident reconstructed in time order from its
 *    evidence, custody events, status changes and threat events.
 *
 * ## The one honesty rule that governs the signatures
 *
 * A digital signature is only worth the custody of the key that made it. This
 * build ships no HSM or KMS signer, so a seal or a bundle is recorded as
 * `UNSIGNED` — the SHA-256 manifest digest is real and always computed, but no
 * signature is fabricated from an ephemeral in-process key nobody can vouch for.
 * When a certified signer is registered, the same digest is signed and the
 * status becomes `SIGNED`. This is the same 501-honesty the rest of the platform
 * uses: real integrity now, real signatures when there is a real key.
 *
 * See `docs/adr/0014-evidence-vault.md`.
 */

// ============================================================================
// Signatures and encryption
// ============================================================================

export const SignatureStatus = {
  /** A digest was computed but not signed — no signer is installed. */
  UNSIGNED: 'UNSIGNED',
  /** Signed by a registered signer. */
  SIGNED: 'SIGNED',
  /** A signature exists but failed verification. */
  INVALID: 'INVALID',
} as const;
export type SignatureStatus = (typeof SignatureStatus)[keyof typeof SignatureStatus];

/**
 * Envelope-encryption metadata for an artefact at rest.
 *
 * A description of how the bytes are protected, never the means to decrypt them.
 * `wrappedDataKey` is the data key encrypted under a KMS master key — opaque and
 * useless without the KMS — and there is deliberately no field anywhere that
 * holds a plaintext key. Same principle as the identity engine's KMS-wrapped
 * templates: a dump of this database decrypts nothing.
 */
export interface EvidenceEncryption {
  algorithm: string;
  /** KMS key id or alias the data key was wrapped under. */
  keyId: string;
  /** The data key, encrypted under the KMS master key. Opaque. */
  wrappedDataKey: string;
  /** Initialisation vector, when the cipher needs one. */
  iv: string | null;
}

/**
 * The canonical manifest of a single artefact.
 *
 * The object that is hashed to produce the seal digest, and signed. It binds the
 * artefact's identity to its integrity-relevant properties, so that swapping the
 * bytes, the size or the checksum after sealing changes the digest and breaks
 * the signature.
 */
export interface EvidenceManifest {
  version: string;
  evidenceId: UUID;
  organizationId: UUID;
  type: EvidenceType;
  label: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 of the artefact bytes. The anchor. */
  checksum: string;
  capturedAt: ISODateString;
  storageKey: string;
  encryption: { algorithm: string; keyId: string } | null;
}

/**
 * The cryptographic seal over an artefact, created when it is sealed.
 *
 * Separate from the `Evidence` row because it is the integrity record, written
 * once, and because a re-signature after key rotation appends rather than edits.
 */
export interface EvidenceSeal extends TenantScoped {
  id: UUID;
  evidenceId: UUID;

  /** SHA-256 hex of the canonical manifest. Always present, always real. */
  manifestDigest: string;
  digestAlgorithm: string;

  signatureStatus: SignatureStatus;
  /** Base64 signature over `manifestDigest`. Null when UNSIGNED. */
  signature: string | null;
  signatureAlgorithm: string | null;
  signatureKeyId: string | null;
  signerProviderId: string | null;
  signedAt: ISODateString | null;

  sealedAt: ISODateString;
  createdAt: ISODateString;
}

// ============================================================================
// Chain of custody
// ============================================================================

/**
 * One link in the tamper-evident chain of custody.
 *
 * `entryHash` is the hash of this event's fields together with `prevHash`, the
 * previous link's hash. Removing or altering any event breaks every hash after
 * it, which is what makes a gap or an edit detectable rather than silent. Legacy
 * events written before the chain existed carry null hashes and are reported as
 * unverifiable rather than as failures.
 */
export interface CustodyEvent {
  id: UUID;
  evidenceId: UUID;
  action: string;
  actorUserId: UUID | null;
  actorEmail: string | null;
  ipAddress: string | null;
  notes: string | null;
  prevHash: string | null;
  entryHash: string | null;
  occurredAt: ISODateString;
}

/** The result of recomputing a custody chain. */
export interface CustodyChainVerification {
  intact: boolean;
  length: number;
  /** How many links carried a hash and were actually checked. */
  verifiedLinks: number;
  /** The first event whose hash did not recompute, when the chain is broken. */
  brokenAtEventId: UUID | null;
}

/**
 * The result of verifying a sealed artefact.
 *
 * `checksumMatches` is deliberately nullable: verifying the bytes against the
 * checksum requires the bytes, which live in the object store the evidence
 * worker owns. This API-side verification checks what it can hold — the manifest
 * digest, the signature and the custody chain — and reports the byte check as
 * "not performed here" rather than pretending to have done it.
 */
export interface EvidenceVerification {
  evidenceId: UUID;
  manifestDigestMatches: boolean;
  checksumMatches: boolean | null;
  signatureStatus: SignatureStatus;
  custody: CustodyChainVerification;
  verifiedAt: ISODateString;
  note: string;
}

// ============================================================================
// Court export
// ============================================================================

export interface ExportManifestItem {
  evidenceId: UUID;
  type: EvidenceType;
  label: string;
  checksum: string;
  manifestDigest: string;
  capturedAt: ISODateString;
  sealedAt: ISODateString | null;
  custody: { events: number; firstAt: ISODateString | null; lastAt: ISODateString | null };
}

/** The signed manifest of a court-export bundle. */
export interface ExportManifest {
  format: string;
  version: string;
  generatedAt: ISODateString;
  organizationId: UUID;
  incidentReference: string | null;
  recipient: string;
  reason: string;
  items: ExportManifestItem[];
}

/**
 * A disclosure of one or more artefacts as a single, signed package.
 *
 * Append-only, referenced (`EXP-2026-000017`), and self-describing: the manifest
 * captures exactly what was disclosed, to whom and why, and the digest and
 * signature let a recipient confirm the package was not altered after it left.
 */
export interface EvidenceExportBundle extends TenantScoped {
  id: UUID;
  reference: string;
  incidentId: UUID | null;

  manifest: ExportManifest;
  /** SHA-256 hex over the canonical manifest. */
  manifestDigest: string;

  signatureStatus: SignatureStatus;
  signature: string | null;
  signatureAlgorithm: string | null;
  signatureKeyId: string | null;
  signerProviderId: string | null;
  signedAt: ISODateString | null;

  itemCount: number;
  recipient: string;
  reason: string;
  format: string;

  exportedByUserId: UUID | null;
  createdAt: ISODateString;
}

// ============================================================================
// Timeline replay
// ============================================================================

export const ReplayEventKind = {
  INCIDENT_STATUS: 'INCIDENT_STATUS',
  INCIDENT_NOTE: 'INCIDENT_NOTE',
  INCIDENT_DISPATCH: 'INCIDENT_DISPATCH',
  EVIDENCE_CAPTURED: 'EVIDENCE_CAPTURED',
  EVIDENCE_SEALED: 'EVIDENCE_SEALED',
  CUSTODY: 'CUSTODY',
  THREAT_EVENT: 'THREAT_EVENT',
} as const;
export type ReplayEventKind = (typeof ReplayEventKind)[keyof typeof ReplayEventKind];

/** One entry in a forensic timeline replay. */
export interface ReplayEvent {
  at: ISODateString;
  kind: ReplayEventKind;
  title: string;
  detail: string | null;
  /** The evidence this entry concerns, when it concerns one. */
  evidenceId: UUID | null;
  actorUserId: UUID | null;
}

/**
 * An incident reconstructed in time order.
 *
 * Merges the incident's own timeline, its evidence capture and custody events,
 * and the threat events that fired — one ordered account of what happened and
 * what was recorded, which is what a reviewer or a court actually reads.
 */
export interface ReplayTimeline {
  incidentId: UUID;
  incidentReference: string;
  generatedAt: ISODateString;
  events: ReplayEvent[];
}

// ============================================================================
// Signer health
// ============================================================================

/** Whether a real signer is installed. Honest health surface; false in this build. */
export interface SignerStatus {
  configured: boolean;
  providerId: string | null;
  algorithm: string | null;
  note: string;
}
