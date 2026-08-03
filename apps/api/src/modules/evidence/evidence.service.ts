import { randomUUID } from 'node:crypto';
import type { AuthUser, Evidence, Paginated } from '@aegisdrive/types';
import { AuditAction, EvidenceStatus } from '@aegisdrive/types';
import { ConflictError, NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { getContext } from '../../core/request-context';
import { recordAudit } from '../audit-logs/audit.service';
import {
  appendCustodyEvent,
  findCustodyChain,
  findEvidence,
  findEvidenceById,
  insertEvidence,
  updateEvidenceById,
} from './evidence.repository';
import { toEvidenceDto } from './evidence.mapper';
import type {
  ExportEvidenceInput,
  ListEvidenceQuery,
  RegisterEvidenceInput,
  SealEvidenceInput,
} from './evidence.schema';

const log = moduleLogger('evidence');

/**
 * Evidence lifecycle: PENDING_UPLOAD → UPLOADING → SEALED → VERIFIED.
 *
 * The invariant this module exists to protect: once an artefact is SEALED, its
 * bytes and its checksum never change. Every read, export and verification is
 * appended to the custody chain, and a checksum mismatch is treated as
 * corruption rather than something to retry.
 */

export async function listEvidence(
  user: AuthUser,
  query: ListEvidenceQuery,
): Promise<Paginated<Evidence>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findEvidence({
    ...pagination,
    organizationId: user.organizationId,
    incidentId: query.incidentId,
    vehicleId: query.vehicleId,
    type: query.type,
    status: query.status,
    search: query.search,
  });

  return paginate(rows.map(toEvidenceDto), pagination, total);
}

/** Reading a sealed artefact's metadata is itself a custody event. */
export async function getEvidence(user: AuthUser, evidenceId: string): Promise<Evidence> {
  const row = await findEvidenceById(user.organizationId, evidenceId);
  if (!row) throw new NotFoundError('Evidence', evidenceId);

  if (row.status === EvidenceStatus.SEALED || row.status === EvidenceStatus.VERIFIED) {
    await appendCustodyEvent({
      evidenceId,
      action: 'ACCESSED',
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getContext()?.ipAddress ?? null,
    });
  }

  return toEvidenceDto(row);
}

/**
 * Registers an artefact and returns the row the uploader will write against.
 *
 * The storage key is generated server-side and namespaced by tenant. Accepting
 * a client-supplied key would let one tenant write into another's prefix.
 */
export async function registerEvidence(
  user: AuthUser,
  input: RegisterEvidenceInput,
): Promise<Evidence> {
  const capturedAt = new Date(input.capturedAt);
  const datePart = capturedAt.toISOString().slice(0, 10);
  const storageKey = `${user.organizationId}/${datePart}/${randomUUID()}`;

  const row = await insertEvidence(user.organizationId, {
    type: input.type,
    status: EvidenceStatus.PENDING_UPLOAD,
    label: input.label,
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: BigInt(input.sizeBytes),
    durationSeconds: input.durationSeconds ?? null,
    checksum: input.checksum,
    capturedAt,
    ...(input.incidentId ? { incident: { connect: { id: input.incidentId } } } : {}),
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    uploadedBy: { connect: { id: user.id } },
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'evidence',
    resourceId: row.id,
    metadata: { type: input.type, incidentId: input.incidentId ?? null },
  });

  return toEvidenceDto(row);
}

/**
 * Seals an uploaded artefact.
 *
 * The checksum recomputed from the stored object must equal the one declared at
 * registration. A mismatch means the bytes in the store are not the bytes the
 * capture device produced, so the row is flagged CORRUPTED rather than sealed —
 * sealing it would launder a broken artefact into an admissible one.
 */
export async function sealEvidence(
  user: AuthUser,
  evidenceId: string,
  input: SealEvidenceInput,
): Promise<Evidence> {
  const existing = await findEvidenceById(user.organizationId, evidenceId);
  if (!existing) throw new NotFoundError('Evidence', evidenceId);

  if (existing.status === EvidenceStatus.SEALED || existing.status === EvidenceStatus.VERIFIED) {
    throw new ConflictError('This artefact is already sealed.');
  }

  if (existing.checksum !== input.checksum) {
    await updateEvidenceById(user.organizationId, evidenceId, {
      status: EvidenceStatus.CORRUPTED,
    });

    await appendCustodyEvent({
      evidenceId,
      action: 'VERIFIED',
      actorUserId: user.id,
      actorEmail: user.email,
      notes: 'Checksum mismatch on seal; artefact marked corrupted.',
    });

    log.error(
      { evidenceId, expected: existing.checksum, actual: input.checksum },
      'Evidence checksum mismatch',
    );

    throw new ConflictError(
      'The uploaded object does not match the declared checksum. The artefact has been marked corrupted.',
    );
  }

  const row = await updateEvidenceById(user.organizationId, evidenceId, {
    status: EvidenceStatus.SEALED,
    sealedAt: new Date(),
  });

  if (!row) throw new NotFoundError('Evidence', evidenceId);

  await appendCustodyEvent({
    evidenceId,
    action: 'SEALED',
    actorUserId: user.id,
    actorEmail: user.email,
    ipAddress: getContext()?.ipAddress ?? null,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'evidence',
    resourceId: evidenceId,
    metadata: { sealed: true, checksum: input.checksum },
  });

  return toEvidenceDto(row);
}

/** Records a disclosure. Only sealed artefacts can be exported. */
export async function exportEvidence(
  user: AuthUser,
  evidenceId: string,
  input: ExportEvidenceInput,
): Promise<Evidence> {
  const row = await findEvidenceById(user.organizationId, evidenceId);
  if (!row) throw new NotFoundError('Evidence', evidenceId);

  if (row.status !== EvidenceStatus.SEALED && row.status !== EvidenceStatus.VERIFIED) {
    throw new ConflictError('Only a sealed artefact can be exported.');
  }

  await appendCustodyEvent({
    evidenceId,
    action: 'EXPORTED',
    actorUserId: user.id,
    actorEmail: user.email,
    ipAddress: getContext()?.ipAddress ?? null,
    notes: `Recipient: ${input.recipient}. Reason: ${input.reason}`,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.EXPORT,
    resourceType: 'evidence',
    resourceId: evidenceId,
    metadata: { recipient: input.recipient, reason: input.reason },
  });

  log.info({ evidenceId, userId: user.id, recipient: input.recipient }, 'Evidence exported');

  return toEvidenceDto(row);
}

export interface CustodyEventDto {
  id: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  notes: string | null;
  occurredAt: string;
}

export async function getCustodyChain(
  user: AuthUser,
  evidenceId: string,
): Promise<CustodyEventDto[]> {
  const row = await findEvidenceById(user.organizationId, evidenceId);
  if (!row) throw new NotFoundError('Evidence', evidenceId);

  const events = await findCustodyChain(evidenceId);

  return events.map((event) => ({
    id: event.id,
    action: event.action,
    actorUserId: event.actorUserId,
    actorEmail: event.actorEmail,
    ipAddress: event.ipAddress,
    notes: event.notes,
    occurredAt: event.occurredAt.toISOString(),
  }));
}
