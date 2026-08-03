import * as Network from 'expo-network';
import { ApiError, api } from '@/lib/api-client';
import {
  due,
  hasPendingPanic,
  markDelivered,
  markFailed,
  oldestPendingAge,
  pendingCount,
  type OutboxEntry,
  type OutboxKind,
} from '@/db/outbox';

/**
 * Sync engine.
 *
 * Drains the outbox whenever there is connectivity. Runs on a timer rather than
 * purely on a connectivity event, because Android's connectivity callbacks are
 * unreliable in Doze and a driver in a dead zone may regain signal without the
 * OS telling anyone.
 *
 * The engine is deliberately dumb about *what* it is sending — every entry is
 * `{ kind, payload }` and the routing table below turns that into a request.
 * Adding an offline-capable action means one table entry, not a new code path.
 */

type Sender = (payload: never) => Promise<void>;

const ROUTES: Record<OutboxKind, Sender> = {
  PANIC_ACTIVATION: async (payload) => {
    // Short timeout: a panic that cannot be delivered in 8 seconds should fail
    // fast and be retried, not hold the queue behind a stalled socket.
    await api.post('/incidents', payload, { timeoutMs: 8_000 });
  },
  PANIC_CANCEL: async (payload: never) => {
    const body = payload as unknown as { incidentId: string; reason: string };
    await api.post(`/incidents/${body.incidentId}/timeline`, { message: body.reason });
  },
  INCIDENT_CREATE: async (payload) => {
    await api.post('/incidents', payload);
  },
  MESSAGE_SEND: async (payload: never) => {
    const body = payload as unknown as { incidentId: string | null; body: string };
    await api.post(
      body.incidentId ? `/incidents/${body.incidentId}/timeline` : '/notifications/send',
      body.incidentId
        ? { message: body.body }
        : {
            recipientUserIds: ['control-room'],
            channels: ['IN_APP'],
            subject: 'Driver message',
            body: body.body,
          },
    );
  },
  EVIDENCE_REGISTER: async (payload) => {
    await api.post('/evidence', payload);
  },
  TELEMETRY_BATCH: async (payload) => {
    await api.post('/telemetry', payload, { timeoutMs: 20_000 });
  },
  DRIVER_STATUS: async (payload: never) => {
    const body = payload as unknown as { driverId: string; status: string; reason?: string };
    await api.post(`/drivers/${body.driverId}/status`, {
      status: body.status,
      reason: body.reason,
    });
  },
  DEVICE_ATTEST: async (payload) => {
    await api.post('/identity/devices/attest', payload);
  },
  CHECK_IN: async (payload: never) => {
    const body = payload as unknown as { incidentId: string; message: string };
    await api.post(`/incidents/${body.incidentId}/timeline`, { message: body.message });
  },
};

export interface SyncStatus {
  pending: number;
  hasPanic: boolean;
  oldestAgeMs: number | null;
  isOnline: boolean;
  lastSyncAt: number | null;
  isDraining: boolean;
}

type StatusListener = (status: SyncStatus) => void;

const DRAIN_INTERVAL_MS = 5_000;
const BATCH_SIZE = 20;

let timer: ReturnType<typeof setInterval> | null = null;
let draining = false;
let lastSyncAt: number | null = null;
let online = true;
const listeners = new Set<StatusListener>();

export function subscribeToSync(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function publish(): Promise<void> {
  const status: SyncStatus = {
    pending: await pendingCount(),
    hasPanic: await hasPendingPanic(),
    oldestAgeMs: await oldestPendingAge(),
    isOnline: online,
    lastSyncAt,
    isDraining: draining,
  };

  for (const listener of listeners) listener(status);
}

async function checkConnectivity(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    // `isInternetReachable` is undefined on some Android builds; treat the
    // interface being connected as good enough and let the request itself be
    // the real test.
    return Boolean(state.isConnected) && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

async function deliver(entry: OutboxEntry): Promise<void> {
  const send = ROUTES[entry.kind];

  if (!send) {
    // An unknown kind is a bug, not a transient failure. Retrying forever would
    // block the queue behind it, so it is dropped with a loud log.
    console.error(`Outbox entry ${entry.id} has unknown kind '${entry.kind}'; discarding.`);
    await markDelivered(entry.id);
    return;
  }

  try {
    await send(entry.payload as never);
    await markDelivered(entry.id);
  } catch (error) {
    if (error instanceof ApiError && !error.isRetryable) {
      // A 4xx will fail identically forever. Keeping it would stall everything
      // behind it, so it is removed — but never silently.
      console.error(
        `Outbox entry ${entry.id} (${entry.kind}) rejected permanently: ${error.code} ${error.message}`,
      );
      await markDelivered(entry.id);
      return;
    }

    await markFailed(entry.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Drains one batch.
 *
 * Sequential, not parallel. The outbox is priority-ordered, and firing twenty
 * requests at once on a marginal connection is how a panic ends up competing
 * with telemetry for the same scarce bandwidth.
 */
export async function drain(): Promise<void> {
  if (draining) return;

  draining = true;
  await publish();

  try {
    online = await checkConnectivity();
    if (!online) return;

    const entries = await due(BATCH_SIZE);

    for (const entry of entries) {
      try {
        await deliver(entry);
      } catch {
        // The entry is rescheduled. Stop the batch: if one request failed on
        // this connection the rest almost certainly will too, and hammering
        // costs battery for nothing.
        break;
      }
    }

    lastSyncAt = Date.now();
  } finally {
    draining = false;
    await publish();
  }
}

export function startSync(): void {
  if (timer) return;

  void drain();
  timer = setInterval(() => void drain(), DRAIN_INTERVAL_MS);
}

export function stopSync(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/** Forces an immediate drain. Called when connectivity is regained. */
export async function syncNow(): Promise<void> {
  await drain();
}
