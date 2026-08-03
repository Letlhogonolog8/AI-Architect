import { create } from 'zustand';
import {
  HEARTBEAT_TIMEOUT_MS,
  LOW_BATTERY_PERCENT,
  WatchPairingState,
  watchTransport,
  type WatchDevice,
} from '@/services/watch/transport';
import { PanicMode, PanicTrigger } from '@/services/panic';
import { useSosStore } from './sos.store';

/**
 * Smartwatch pairing state.
 *
 * Owns the heartbeat watchdog. A paired watch that has gone quiet is treated as
 * disconnected and surfaced to the driver, because a panic button someone is
 * relying on that has silently stopped working is worse than none at all.
 */
interface WatchState {
  state: WatchPairingState;
  device: WatchDevice | null;
  discovered: WatchDevice[];
  lastHeartbeatAt: number | null;
  error: string | null;

  initialise: () => Promise<void>;
  scan: () => Promise<void>;
  pair: (deviceId: string) => Promise<void>;
  unpair: () => Promise<void>;
}

let unsubscribe: (() => void) | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;

export const useWatchStore = create<WatchState>((set, get) => ({
  state: WatchPairingState.UNSUPPORTED,
  device: null,
  discovered: [],
  lastHeartbeatAt: null,
  error: null,

  initialise: async () => {
    const transport = watchTransport();

    if (!(await transport.isSupported())) {
      set({ state: WatchPairingState.UNSUPPORTED });
      return;
    }

    set({ state: WatchPairingState.UNPAIRED, error: null });
  },

  scan: async () => {
    set({ state: WatchPairingState.SCANNING, error: null, discovered: [] });

    try {
      const discovered = await watchTransport().scan(10_000);
      set({
        discovered,
        state: discovered.length > 0 ? WatchPairingState.UNPAIRED : WatchPairingState.UNPAIRED,
      });
    } catch (error) {
      set({
        state: WatchPairingState.ERROR,
        error: error instanceof Error ? error.message : 'Scan failed.',
      });
    }
  },

  pair: async (deviceId) => {
    set({ state: WatchPairingState.PAIRING, error: null });

    try {
      const transport = watchTransport();
      const device = await transport.pair(deviceId);

      unsubscribe?.();
      unsubscribe = transport.subscribe((message) => {
        switch (message.type) {
          case 'PANIC':
            // No grace period. A watch press is a deliberate act under duress.
            void useSosStore.getState().triggerImmediate(PanicTrigger.WATCH, PanicMode.SILENT);
            break;

          case 'PANIC_CANCEL':
            void useSosStore.getState().standDown('Cancelled from the paired watch.');
            break;

          case 'HEARTBEAT':
            set((current) => ({
              lastHeartbeatAt: Date.now(),
              state: WatchPairingState.PAIRED,
              device: current.device
                ? { ...current.device, batteryPercent: message.batteryPercent }
                : current.device,
            }));
            break;

          case 'ACK':
            break;
        }
      });

      set({
        device,
        state: WatchPairingState.PAIRED,
        lastHeartbeatAt: Date.now(),
        discovered: [],
      });

      startWatchdog(set, get);
    } catch (error) {
      set({
        state: WatchPairingState.ERROR,
        error: error instanceof Error ? error.message : 'Pairing failed.',
      });
    }
  },

  unpair: async () => {
    unsubscribe?.();
    unsubscribe = null;
    stopWatchdog();

    await watchTransport().unpair();
    set({ state: WatchPairingState.UNPAIRED, device: null, lastHeartbeatAt: null });
  },
}));

function startWatchdog(set: (partial: Partial<WatchState>) => void, get: () => WatchState): void {
  stopWatchdog();

  watchdog = setInterval(() => {
    const { lastHeartbeatAt, state } = get();
    if (state !== WatchPairingState.PAIRED || lastHeartbeatAt === null) return;

    if (Date.now() - lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      set({ state: WatchPairingState.DISCONNECTED });
    }
  }, 30_000);
}

function stopWatchdog(): void {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}

/** True when the driver should be warned the watch may not last the trip. */
export function isWatchBatteryLow(device: WatchDevice | null): boolean {
  return device?.batteryPercent !== null && (device?.batteryPercent ?? 100) <= LOW_BATTERY_PERCENT;
}
