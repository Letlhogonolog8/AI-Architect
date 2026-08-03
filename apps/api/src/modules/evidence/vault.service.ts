import type {
  AuthUser,
  EvidenceExportBundle,
  EvidenceSeal,
  EvidenceVerification,
  ExportManifestItem,
  Paginated,
  ReplayEvent,
  ReplayTimeline,
  SignerStatus,
} from '@aegisdrive/types';
import { AuditAction, EvidenceStatus, ReplayEventKind, SignatureStatus } from '@aegisdrive/types';
import {
  COURT_BUNDLE_FORMAT,
  ConflictError,
  DISCLOSABLE_EVIDENCE_STATUSES,
  NotFoundError,
  buildEvidenceManifest,
  buildExportManifest,
  exportManifestPayload,
  manifestPayload,
  normalisePagination,
  paginate,
  registeredSigner,
  verifyCustodyChain,
} from '@aegisdrive/shared';
import type { Prisma } from '@prisma/client';
import { moduleLogger } from '../../core/logger';
import { getContext } from '../../core/request-context';
import { activeSignerInfo, sha256Hex, signDigest } from '../../core/crypto';
import { recordAudit } from '../audit-logs/audit.service';
import { findIncidentById, findTimeline } from '../incidents/incident.repository';
import {
  appendCustodyEvent,
  findCustodyChain,
  findEvidenceById,
  findEvidenceByIds,
  updateEvidenceById,
} from './evidence.repository';
import * as vault from './vault.repository';
import { toCustodyEventDto, toExportBundleDto, toSealDto } from './vault.mapper';
import type { CreateExportBundleInput, ListExportBundlesQuery } from './vault.schema';

const log = moduleLogger('evidence-vault');

const SEALED_STATES: readonly string[] = DISCLOSABLE_EVIDENCE_STATUSES;

// =========================================================================
// Seal
// =========================================================================

export async function getSeal(user: AuthUser, evidenceId: string): Promise<EvidenceSeal> {
  const evidence = await findEvidenceById(user.organizationId, evidenceId);
  if (!evidence) throw new NotFoundError('Evidence', evidenceId);

  const seal = await vault.findSealByEvidenceId(user.organizationId, evidenceId);
  if (!seal) throw new NotFoundError('Evidence seal', evidenceId);

  return toSealDto(seal);
}

// =========================================================================
// Verification
// =========================================================================

/**
 * Verifies a sealed artefact from what the API can hold.
 *
 * Recomputes the manifest digest from the current row and compares it to the
 * seal, replays the custody chain, and reports the signature status. It cannot
 * check the bytes against the checksum — the bytes live in the object store the
 * evidence worker owns — so `checksumMatches` is reported as null rather than
 * pretended. A digest mismatch or a broken chain flips the artefact to CORRUPTED;
 * a clean verify of a SEALED artefact promotes it to VERIFIED.
 */
export async function verifyEvidence(
  user: AuthUser,
  evidenceId: string,
): Promise<EvidenceVerification> {
  const row = await findEvidenceById(user.organizationId, evidenceId);
  if (!row) throw new NotFoundError('Evidence', evidenceId);

  const seal = await vault.findSealByEvidenceId(user.organizationId, evidenceId);
  if (!seal) {
    throw new ConflictError('This artefact has no cryptographic seal; it has not been sealed.');
  }

  const manifest = buildEvidenceManifest({
    evidenceId: row.id,
    organizationId: row.organizationId,
    type: row.type,
    label: row.label,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    checksum: row.checksum,
    capturedAt: row.capturedAt.toISOString(),
    storageKey: row.storageKey,
    encryption:
      row.encryptionAlgorithm && row.encryptionKeyId
        ? { algorithm: row.encryptionAlgorithm, keyId: row.encryptionKeyId }
        : null,
  });
  const recomputed = sha256Hex(manifestPayload(manifest));
  const manifestDigestMatches = recomputed === seal.manifestDigest;

  const custodyRows = await findCustodyChain(evidenceId);
  const custody = verifyCustodyChain(custodyRows.map(toCustodyEventDto), sha256Hex);

  const intact = manifestDigestMatches && custody.intact;

  // Record the verification in the chain itself, then move the artefact.
  await appendCustodyEvent({
    evidenceId,
    action: 'VERIFIED',
    actorUserId: user.id,
    actorEmail: user.email,
    ipAddress: getContext()?.ipAddress ?? null,
    notes: intact
      ? 'Manifest digest and custody chain verified.'
      : `Verification failed: ${!manifestDigestMatches ? 'manifest digest mismatch' : 'custody chain broken'}.`,
  });

  if (!intact && row.status !== EvidenceStatus.CORRUPTED) {
    await updateEvidenceById(user.organizationId, evidenceId, {
      status: EvidenceStatus.CORRUPTED,
    });
    log.error(
      { evidenceId, manifestDigestMatches, custodyIntact: custody.intact },
      'Evidence verification failed',
    );
  } else if (intact && row.status === EvidenceStatus.SEALED) {
    await updateEvidenceById(user.organizationId, evidenceId, {
      status: EvidenceStatus.VERIFIED,
    });
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'evidence',
    resourceId: evidenceId,
    metadata: { verified: intact, manifestDigestMatches, custodyIntact: custody.intact },
  });

  return {
    evidenceId,
    manifestDigestMatches,
    checksumMatches: null,
    signatureStatus: seal.signatureStatus as SignatureStatus,
    custody,
    verifiedAt: new Date().toISOString(),
    note: 'Byte-vs-checksum verification is performed by the evidence worker against the object store, not here.',
  };
}

// =========================================================================
// Court export
// =========================================================================

/**
 * Assembles a court-export bundle: one signed manifest over many sealed
 * artefacts.
 *
 * Every artefact must be sealed and must carry a seal digest — an unsealed one
 * has no integrity anchor to disclose. The manifest lists each artefact's digest
 * and a summary of its custody, the whole manifest is hashed and signed (or
 * UNSIGNED when no signer is installed), and every included artefact gets an
 * EXPORTED custody event so the disclosure is on each one's own chain too.
 */
export async function createCourtExport(
  user: AuthUser,
  input: CreateExportBundleInput,
): Promise<EvidenceExportBundle> {
  const rows = await findEvidenceByIds(user.organizationId, input.evidenceIds);

  const found = new Set(rows.map((r) => r.id));
  const missing = input.evidenceIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new NotFoundError('Evidence', missing[0]);
  }

  const notSealed = rows.filter((r) => !SEALED_STATES.includes(r.status));
  if (notSealed.length > 0) {
    throw new ConflictError(
      `Every artefact must be sealed before export. Not sealed: ${notSealed
        .map((r) => r.label)
        .join(', ')}.`,
    );
  }

  let incidentReference: string | null = null;
  if (input.incidentId) {
    const incident = await findIncidentById(user.organizationId, input.incidentId);
    if (!incident) throw new NotFoundError('Incident', input.incidentId);
    incidentReference = incident.reference;
  }

  const items: ExportManifestItem[] = [];
  for (const row of rows) {
    const seal = await vault.findSealByEvidenceId(user.organizationId, row.id);
    if (!seal) {
      throw new ConflictError(
        `Artefact "${row.label}" has no cryptographic seal and cannot be exported.`,
      );
    }

    const chain = await findCustodyChain(row.id);
    items.push({
      evidenceId: row.id,
      type: row.type,
      label: row.label,
      checksum: row.checksum,
      manifestDigest: seal.manifestDigest,
      capturedAt: row.capturedAt.toISOString(),
      sealedAt: row.sealedAt?.toISOString() ?? null,
      custody: {
        events: chain.length,
        firstAt: chain[0]?.occurredAt.toISOString() ?? null,
        lastAt: chain[chain.length - 1]?.occurredAt.toISOString() ?? null,
      },
    });
  }

  const generatedAt = new Date().toISOString();
  const manifest = buildExportManifest({
    organizationId: user.organizationId,
    incidentReference,
    recipient: input.recipient,
    reason: input.reason,
    generatedAt,
    items,
  });

  const manifestDigest = sha256Hex(exportManifestPayload(manifest));

  let signature: Awaited<ReturnType<typeof signDigest>> = null;
  try {
    signature = await signDigest(manifestDigest);
  } catch (error) {
    log.error({ err: error }, 'Export bundle signing failed; bundle UNSIGNED');
  }

  const reference = await vault.allocateExportReference(user.organizationId);

  const bundle = await vault.insertExportBundle(user.organizationId, {
    reference,
    manifest: manifest as unknown as Prisma.InputJsonValue,
    manifestDigest,
    signatureStatus: signature ? SignatureStatus.SIGNED : SignatureStatus.UNSIGNED,
    signature: signature?.signature ?? null,
    signatureAlgorithm: signature?.algorithm ?? null,
    signatureKeyId: signature?.keyId ?? null,
    signerProviderId: signature ? (activeSignerInfo()?.providerId ?? null) : null,
    signedAt: signature ? new Date(generatedAt) : null,
    itemCount: items.length,
    recipient: input.recipient,
    reason: input.reason,
    format: COURT_BUNDLE_FORMAT,
    exportedByUserId: user.id,
    ...(input.incidentId ? { incident: { connect: { id: input.incidentId } } } : {}),
  });

  for (const row of rows) {
    await appendCustodyEvent({
      evidenceId: row.id,
      action: 'EXPORTED',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getContext()?.ipAddress ?? null,
      notes: `Court export ${reference}. Recipient: ${input.recipient}. Reason: ${input.reason}`,
    });
  }

  log.info(
    { reference, itemCount: items.length, signed: signature !== null, recipient: input.recipient },
    'Court export bundle created',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.EXPORT,
    resourceType: 'evidence_export_bundle',
    resourceId: bundle.id,
    metadata: {
      reference,
      itemCount: items.length,
      recipient: input.recipient,
      signed: signature !== null,
    },
  });

  return toExportBundleDto(bundle);
}

export async function getExportBundle(
  user: AuthUser,
  bundleId: string,
): Promise<EvidenceExportBundle> {
  const row = await vault.findExportBundleById(user.organizationId, bundleId);
  if (!row) throw new NotFoundError('Export bundle', bundleId);
  return toExportBundleDto(row);
}

export async function listExportBundles(
  user: AuthUser,
  query: ListExportBundlesQuery,
): Promise<Paginated<EvidenceExportBundle>> {
  const pagination = normalisePagination(query);
  const { rows, total } = await vault.findExportBundles({
    ...pagination,
    organizationId: user.organizationId,
    incidentId: query.incidentId,
  });
  return paginate(rows.map(toExportBundleDto), pagination, total);
}

// =========================================================================
// Timeline replay
// =========================================================================

function incidentEntryKind(kind: string): ReplayEvent['kind'] {
  if (kind === 'STATUS_CHANGE') return ReplayEventKind.INCIDENT_STATUS;
  if (kind === 'DISPATCH') return ReplayEventKind.INCIDENT_DISPATCH;
  return ReplayEventKind.INCIDENT_NOTE;
}

/**
 * Reconstructs an incident in time order.
 *
 * Merges the incident's own timeline, its evidence capture and seal moments,
 * every custody event on that evidence, and the threat events that fired, into
 * one ordered account — the single narrative a reviewer or a court reads instead
 * of four separate logs they have to interleave by hand.
 */
export async function getReplayTimeline(
  user: AuthUser,
  incidentId: string,
): Promise<ReplayTimeline> {
  const incident = await findIncidentById(user.organizationId, incidentId);
  if (!incident) throw new NotFoundError('Incident', incidentId);

  const [timeline, evidence, threats] = await Promise.all([
    findTimeline(incidentId),
    vault.findEvidenceByIncident(user.organizationId, incidentId),
    vault.findThreatEventsByIncident(user.organizationId, incidentId),
  ]);

  const events: ReplayEvent[] = [];

  for (const entry of timeline) {
    events.push({
      at: entry.occurredAt.toISOString(),
      kind: incidentEntryKind(entry.kind),
      title: entry.message,
      detail: null,
      evidenceId: null,
      actorUserId: entry.actorUserId,
    });
  }

  for (const item of evidence) {
    events.push({
      at: item.capturedAt.toISOString(),
      kind: ReplayEventKind.EVIDENCE_CAPTURED,
      title: `${item.type} captured: ${item.label}`,
      detail: `checksum ${item.checksum.slice(0, 12)}…`,
      evidenceId: item.id,
      actorUserId: item.uploadedByUserId,
    });

    if (item.sealedAt) {
      events.push({
        at: item.sealedAt.toISOString(),
        kind: ReplayEventKind.EVIDENCE_SEALED,
        title: `Sealed: ${item.label}`,
        detail: null,
        evidenceId: item.id,
        actorUserId: null,
      });
    }

    const chain = await findCustodyChain(item.id);
    for (const link of chain) {
      events.push({
        at: link.occurredAt.toISOString(),
        kind: ReplayEventKind.CUSTODY,
        title: `Custody: ${link.action} (${item.label})`,
        detail: link.notes,
        evidenceId: item.id,
        actorUserId: link.actorUserId,
      });
    }
  }

  for (const threat of threats) {
    events.push({
      at: threat.detectedAt.toISOString(),
      kind: ReplayEventKind.THREAT_EVENT,
      title: `Threat: ${threat.type} (${threat.level})`,
      detail: threat.description,
      evidenceId: null,
      actorUserId: null,
    });
  }

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    incidentId,
    incidentReference: incident.reference,
    generatedAt: new Date().toISOString(),
    events,
  };
}

// =========================================================================
// Signer health
// =========================================================================

/** Honest health surface: whether a real signer is installed. False in this build. */
export function signerStatus(): SignerStatus {
  const signer = registeredSigner();
  return {
    configured: signer !== null,
    providerId: signer?.providerId ?? null,
    algorithm: signer?.algorithm ?? null,
    note: signer
      ? 'A signer is installed; seals and bundles are signed.'
      : 'No signer is installed. Manifest digests are computed and real; signatures are UNSIGNED until an HSM/KMS signer is registered.',
  };
}
