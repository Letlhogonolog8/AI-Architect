import * as Crypto from 'expo-crypto';
import { openDatabase } from './database';

/**
 * Durable outbox.
 *
 * Every mutation the app makes is written here **before** any network attempt,
 * then drained by the sync engine. That ordering is the whole design: a panic
 * activation must be recorded on the device the instant the driver triggers it,
 * whether or not there is signal, whether or not the app survives the next
 * thirty seconds.
 *
 * Priority, not FIFO. A panic queued behind forty telemetry frames would wait
 * for them to upload first, which is the wrong outcome by a wide margin.
 */

export const OutboxPriority = {
  /** Life-safety. Drains first, always. */
  PANIC: 0,
  INCIDENT: 10,
  MESSAGE: 20,
  EVIDENCE: 40,
  TELEMETRY: 80,
  ROUTINE: 100,
} as const;

export type OutboxKind =
  | 'PANIC_ACTIVATION'
  | 'PANIC_CANCEL'
  | 'INCIDENT_CREATE'
  | 'MESSAGE_SEND'
  | 'EVIDENCE_REGISTER'
  | 'TELEMETRY_BATCH'
  | 'DRIVER_STATUS'
  | 'DEVICE_ATTEST'
  | 'CHECK_IN';

export interface OutboxEntry {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  priority: number;
}

interface OutboxRow {
  id: string;
  kind: string;
  payload: string;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  priority: number;
}

const PRIORITY_BY_KIND: Record<OutboxKind, number> = {
  PANIC_ACTIVATION: OutboxPriority.PANIC,
  PANIC_CANCEL: OutboxPriority.PANIC,
  INCIDENT_CREATE: OutboxPriority.INCIDENT,
  MESSAGE_SEND: OutboxPriority.MESSAGE,
  EVIDENCE_REGISTER: OutboxPriority.EVIDENCE,
  TELEMETRY_BATCH: OutboxPriority.TELEMETRY,
  DRIVER_STATUS: OutboxPriority.ROUTINE,
  DEVICE_ATTEST: OutboxPriority.ROUTINE,
  CHECK_IN: OutboxPriority.ROUTINE,
};

/**
 * Retry schedule in milliseconds, indexed by attempt count.
 *
 * Front-loaded: the first four retries land inside ten seconds, because that is
 * the window in which delivering a panic still changes the outcome. The tail
 * stretches to half-hourly for a vehicle sitting in a coverage dead zone.
 */
const RETRY_SCHEDULE_MS: readonly number[] = [
  0, 1_000, 3_000, 6_000, 15_000, 30_000, 60_000, 300_000, 900_000, 1_800_000,
];

export function retryDelayMs(attempt: number): number {
  return RETRY_SCHEDULE_MS[attempt] ?? RETRY_SCHEDULE_MS[RETRY_SCHEDULE_MS.length - 1] ?? 1_800_000;
}

function toEntry(row: OutboxRow): OutboxEntry {
  return {
    id: row.id,
    kind: row.kind as OutboxKind,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    priority: row.priority,
  };
}

/**
 * Queues a mutation.
 *
 * Returns the id synchronously enough for the caller to show confirmation. The
 * caller must not wait on the network before telling the driver their panic
 * registered — the queue write *is* the confirmation.
 */
export async function enqueue(
  kind: OutboxKind,
  payload: unknown,
  options: { id?: string } = {},
): Promise<string> {
  const database = await openDatabase();
  const id = options.id ?? Crypto.randomUUID();
  const now = Date.now();

  await database.runAsync(
    `INSERT OR REPLACE INTO outbox (id, kind, payload, created_at, attempts, next_attempt_at, last_error, priority)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?);`,
    id,
    kind,
    JSON.stringify(payload),
    now,
    now,
    PRIORITY_BY_KIND[kind],
  );

  return id;
}

/** Entries due for a delivery attempt, highest priority first. */
export async function due(limit = 25): Promise<OutboxEntry[]> {
  const database = await openDatabase();

  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox
      WHERE next_attempt_at <= ?
      ORDER BY priority ASC, next_attempt_at ASC, created_at ASC
      LIMIT ?;`,
    Date.now(),
    limit,
  );

  return rows.map(toEntry);
}

export async function markDelivered(id: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync('DELETE FROM outbox WHERE id = ?;', id);
}

/**
 * Records a failed attempt and schedules the next one.
 *
 * Entries are **never discarded**, however many times they fail. A panic that
 * has failed twelve times is still a panic; dropping it would mean a driver
 * whose phone had no signal for an hour is simply never helped. Stale entries
 * are surfaced to the operator instead — see `oldestPendingAge`.
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const database = await openDatabase();

  const row = await database.getFirstAsync<{ attempts: number }>(
    'SELECT attempts FROM outbox WHERE id = ?;',
    id,
  );

  const attempts = (row?.attempts ?? 0) + 1;

  await database.runAsync(
    `UPDATE outbox
        SET attempts = ?, next_attempt_at = ?, last_error = ?
      WHERE id = ?;`,
    attempts,
    Date.now() + retryDelayMs(attempts),
    error.slice(0, 500),
    id,
  );
}

export async function pendingCount(): Promise<number> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM outbox;',
  );
  return row?.count ?? 0;
}

/** Whether anything life-safety-critical is still undelivered. */
export async function hasPendingPanic(): Promise<boolean> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM outbox WHERE priority = ?;',
    OutboxPriority.PANIC,
  );
  return (row?.count ?? 0) > 0;
}

/** Age of the oldest undelivered entry, in milliseconds. Null when empty. */
export async function oldestPendingAge(): Promise<number | null> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ created_at: number }>(
    'SELECT created_at FROM outbox ORDER BY created_at ASC LIMIT 1;',
  );
  return row ? Date.now() - row.created_at : null;
}
