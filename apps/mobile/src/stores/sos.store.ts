import { create } from 'zustand';
import {
  PANIC_GRACE_MS,
  PanicMode,
  PanicTrigger,
  activatePanic,
  cancelPanic,
  requiresGracePeriod,
  type PanicActivation,
} from '@/services/panic';
import { useAuthStore } from './auth.store';

/**
 * SOS state machine.
 *
 * ```
 *   idle ──arm()──► arming ──(grace elapses)──► active
 *     ▲               │                            │
 *     └──disarm()─────┘                            │
 *     └────────────────stand-down()────────────────┘
 * ```
 *
 * `arming` exists only for the on-screen button. Covert, voice and watch
 * triggers go straight to `active`: they are deliberate acts performed under
 * duress, and a countdown an attacker could interrupt defeats the purpose.
 */

export type SosPhase = 'idle' | 'arming' | 'active';

interface SosState {
  phase: SosPhase;
  mode: PanicMode;
  trigger: PanicTrigger | null;
  /** Milliseconds left in the grace period. Drives the countdown ring. */
  remainingMs: number;
  activation: PanicActivation | null;
  /** True while the app is disguised as something innocuous. */
  covertScreenActive: boolean;

  arm: (trigger: PanicTrigger, mode?: PanicMode) => void;
  disarm: () => void;
  /** Fires immediately, bypassing any grace period. */
  triggerImmediate: (trigger: PanicTrigger, mode?: PanicMode) => Promise<void>;
  standDown: (reason: string) => Promise<void>;
  setCovertScreen: (active: boolean) => void;
}

let graceTimer: ReturnType<typeof setInterval> | null = null;

function clearGrace(): void {
  if (graceTimer) clearInterval(graceTimer);
  graceTimer = null;
}

export const useSosStore = create<SosState>((set, get) => ({
  phase: 'idle',
  mode: PanicMode.SILENT,
  trigger: null,
  remainingMs: 0,
  activation: null,
  covertScreenActive: false,

  arm: (trigger, mode = PanicMode.SILENT) => {
    if (get().phase !== 'idle') return;

    if (!requiresGracePeriod(trigger)) {
      void get().triggerImmediate(trigger, mode);
      return;
    }

    set({ phase: 'arming', trigger, mode, remainingMs: PANIC_GRACE_MS });

    const startedAt = Date.now();
    clearGrace();

    graceTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, PANIC_GRACE_MS - elapsed);

      set({ remainingMs: remaining });

      if (remaining === 0) {
        clearGrace();
        void get().triggerImmediate(trigger, mode);
      }
    }, 100);
  },

  disarm: () => {
    if (get().phase !== 'arming') return;
    clearGrace();
    set({ phase: 'idle', trigger: null, remainingMs: 0 });
  },

  triggerImmediate: async (trigger, mode = PanicMode.SILENT) => {
    clearGrace();

    // Set active *before* awaiting. The UI must reflect the activation the
    // instant it is committed, not after the durable write resolves.
    set({ phase: 'active', trigger, mode, remainingMs: 0 });

    const { vehicle, driver } = useAuthStore.getState();

    const activation = await activatePanic({
      mode,
      trigger,
      vehicleId: vehicle?.id ?? null,
      driverId: driver?.id ?? null,
    });

    set({ activation });
  },

  standDown: async (reason) => {
    const { activation } = get();
    if (activation) await cancelPanic(activation.id, reason);

    clearGrace();
    set({
      phase: 'idle',
      trigger: null,
      mode: PanicMode.SILENT,
      remainingMs: 0,
      activation: null,
      covertScreenActive: false,
    });
  },

  setCovertScreen: (covertScreenActive) => set({ covertScreenActive }),
}));

/** True when an alarm is live. Used by the shell to render the alarm chrome. */
export const useIsSosActive = (): boolean => useSosStore((state) => state.phase === 'active');
