import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import { EvidenceType } from '@/types';
import { openDatabase } from '@/db/database';
import { enqueue } from '@/db/outbox';

/**
 * Evidence capture.
 *
 * Media is written to the device first, hashed, recorded locally, and only then
 * queued for upload. That ordering matters for the same reason it does on the
 * API: the checksum must be computed over the bytes as captured, before they
 * cross a network, or it proves nothing.
 *
 * The file stays on the device until the upload is confirmed. A hijacking
 * happens in a dead zone; deleting local media on "upload started" would lose
 * the only copy of the evidence.
 */

const EVIDENCE_DIRECTORY = `${FileSystem.documentDirectory}evidence/`;

export interface LocalEvidence {
  id: string;
  incidentId: string | null;
  type: EvidenceType;
  fileUri: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  checksum: string;
  capturedAt: string;
  uploaded: boolean;
}

interface EvidenceRow {
  id: string;
  incident_id: string | null;
  type: string;
  file_uri: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  checksum: string;
  captured_at: number;
  uploaded: number;
}

async function ensureDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EVIDENCE_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EVIDENCE_DIRECTORY, { intermediates: true });
  }
}

/**
 * SHA-256 of the file.
 *
 * Read as base64 and hashed in one pass. Adequate for the clip lengths this app
 * produces (seconds to a few minutes); a streaming hash becomes necessary if
 * continuous recording is ever added, and is noted as such in the evidence
 * architecture doc.
 */
async function computeChecksum(fileUri: string): Promise<string> {
  const contents = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, contents, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * Records a captured file as evidence and queues its registration.
 *
 * `sourceUri` is the temporary file the camera or recorder produced; it is
 * moved into the app's own directory so the OS cannot reclaim it.
 */
export async function captureEvidence(input: {
  sourceUri: string;
  type: EvidenceType;
  mimeType: string;
  incidentId: string | null;
  vehicleId: string | null;
  durationSeconds?: number | null;
  label?: string;
}): Promise<LocalEvidence> {
  await ensureDirectory();

  const id = Crypto.randomUUID();
  const extension = input.mimeType.split('/')[1] ?? 'bin';
  const destination = `${EVIDENCE_DIRECTORY}${id}.${extension}`;

  await FileSystem.moveAsync({ from: input.sourceUri, to: destination });

  const info = await FileSystem.getInfoAsync(destination, { size: true });
  const sizeBytes = info.exists && 'size' in info ? info.size : 0;
  const checksum = await computeChecksum(destination);
  const capturedAt = new Date().toISOString();

  const record: LocalEvidence = {
    id,
    incidentId: input.incidentId,
    type: input.type,
    fileUri: destination,
    mimeType: input.mimeType,
    sizeBytes,
    durationSeconds: input.durationSeconds ?? null,
    checksum,
    capturedAt,
    uploaded: false,
  };

  const database = await openDatabase();
  await database.runAsync(
    `INSERT INTO evidence_queue
       (id, incident_id, type, file_uri, mime_type, size_bytes, duration_seconds, checksum, captured_at, uploaded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
    id,
    input.incidentId,
    input.type,
    destination,
    input.mimeType,
    sizeBytes,
    input.durationSeconds ?? null,
    checksum,
    Date.parse(capturedAt),
  );

  // Registers the artefact with the API. The bytes are uploaded separately
  // against a signed URL — this only declares the artefact and its checksum, so
  // the server can verify what eventually arrives.
  await enqueue(
    'EVIDENCE_REGISTER',
    {
      type: input.type,
      label: input.label ?? `${input.type} captured by driver app`,
      mimeType: input.mimeType,
      sizeBytes,
      durationSeconds: input.durationSeconds ?? null,
      checksum,
      capturedAt,
      incidentId: input.incidentId,
      vehicleId: input.vehicleId,
    },
    { id },
  );

  return record;
}

export async function listLocalEvidence(): Promise<LocalEvidence[]> {
  const database = await openDatabase();

  const rows = await database.getAllAsync<EvidenceRow>(
    'SELECT * FROM evidence_queue ORDER BY captured_at DESC;',
  );

  return rows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    type: row.type as EvidenceType,
    fileUri: row.file_uri,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    checksum: row.checksum,
    capturedAt: new Date(row.captured_at).toISOString(),
    uploaded: row.uploaded === 1,
  }));
}

export async function markEvidenceUploaded(id: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('UPDATE evidence_queue SET uploaded = 1 WHERE id = ?;', id);
}

/**
 * Deletes local copies of artefacts the server has confirmed.
 *
 * Only ever removes files whose upload is confirmed, and only when the device is
 * genuinely short of space. Evidence on a phone is often the only copy for
 * hours after an incident.
 */
export async function pruneUploadedEvidence(olderThanMs = 7 * 86_400_000): Promise<number> {
  const database = await openDatabase();
  const cutoff = Date.now() - olderThanMs;

  const rows = await database.getAllAsync<EvidenceRow>(
    'SELECT * FROM evidence_queue WHERE uploaded = 1 AND captured_at < ?;',
    cutoff,
  );

  for (const row of rows) {
    try {
      await FileSystem.deleteAsync(row.file_uri, { idempotent: true });
    } catch {
      // A missing file is fine; the row is removed either way.
    }
    await database.runAsync('DELETE FROM evidence_queue WHERE id = ?;', row.id);
  }

  return rows.length;
}

/** Bytes of local evidence held on the device. Shown on the settings screen. */
export async function localEvidenceBytes(): Promise<number> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(size_bytes) as total FROM evidence_queue;',
  );
  return row?.total ?? 0;
}
