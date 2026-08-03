import { create } from 'zustand';
import { startSync, subscribeToSync, syncNow, type SyncStatus } from '@/services/sync';

/**
 * Connectivity and sync state.
 *
 * The driver-facing question is not "am I online" but "is anything I did still
 * undelivered, and for how long". A panic queued four minutes ago with no
 * signal is the single most important thing this app can tell someone, and it
 * is why `oldestAgeMs` and `hasPanic` are first-class here.
 */
interface ConnectivityState extends SyncStatus {
  /** Starts the sync engine and begins publishing status. Called once, on mount. */
  begin: () => void;
  retryNow: () => Promise<void>;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  pending: 0,
  hasPanic: false,
  oldestAgeMs: null,
  isOnline: true,
  lastSyncAt: null,
  isDraining: false,

  begin: () => {
    subscribeToSync((status) => set(status));
    startSync();
  },

  retryNow: async () => {
    await syncNow();
  },
}));

/**
 * The banner state the shell renders.
 *
 * `degraded` is deliberately distinct from `offline`: a connected app whose
 * queue has been stuck for two minutes is a *worse* situation than a cleanly
 * offline one, because the driver would otherwise assume delivery succeeded.
 */
export type ConnectivityBanner = 'none' | 'offline' | 'degraded' | 'panic-pending';

const STUCK_THRESHOLD_MS = 60_000;

export function bannerFor(state: SyncStatus): ConnectivityBanner {
  if (state.hasPanic) return 'panic-pending';
  if (!state.isOnline) return 'offline';
  if (state.oldestAgeMs !== null && state.oldestAgeMs > STUCK_THRESHOLD_MS) return 'degraded';
  return 'none';
}
