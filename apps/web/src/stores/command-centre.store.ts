import { create } from 'zustand';
import type {
  AIDecision,
  Alert,
  CameraDetection,
  CameraStatus,
  FleetSnapshot,
  KpiMetric,
  ResponderAsset,
  ThreatEvent,
  VehiclePositionUpdate,
} from '@aegisdrive/types';
import type { ConnectionState } from '@/realtime';

/**
 * Live command-centre state.
 *
 * Holds only what arrives over the realtime channel. Everything fetched over
 * HTTP stays in React Query — the two have different semantics and mixing them
 * is what makes dashboards either stale or wasteful.
 *
 * Positions are a keyed record rather than an array: at 40 vehicles ticking
 * every second, an array would reallocate 40 times a second and re-render every
 * consumer, where a keyed write lets a selector subscribe to one vehicle.
 */

const MAX_DECISIONS = 40;
/** Caps on retained live events. A console left open overnight must not leak memory. */
const MAX_ALERTS = 50;
const MAX_THREATS = 50;

export interface CameraLiveState {
  status: CameraStatus;
  detections: CameraDetection[];
  lastFrameAt: string;
}

interface CommandCentreState {
  connection: ConnectionState;
  positions: Record<string, VehiclePositionUpdate>;
  responders: Record<string, ResponderAsset>;
  cameras: Record<string, CameraLiveState>;
  kpis: KpiMetric[];
  snapshot: FleetSnapshot | null;
  decisions: AIDecision[];
  /** Newest first. Feeds the alert rail in the app shell. */
  liveAlerts: Alert[];
  liveThreats: ThreatEvent[];
  /** Wall-clock of the most recent inbound message; drives the staleness badge. */
  lastMessageAt: number | null;

  setConnection: (connection: ConnectionState) => void;
  applyPosition: (update: VehiclePositionUpdate) => void;
  applyResponder: (responder: ResponderAsset) => void;
  applyCamera: (cameraId: string, state: CameraLiveState) => void;
  applyKpis: (kpis: KpiMetric[]) => void;
  applySnapshot: (snapshot: FleetSnapshot) => void;
  pushDecision: (decision: AIDecision) => void;
  resolveDecision: (decision: AIDecision) => void;
  pushAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  pushThreat: (threat: ThreatEvent) => void;
  reset: () => void;
}

const initialState = {
  connection: 'idle' as ConnectionState,
  positions: {},
  responders: {},
  cameras: {},
  kpis: [],
  snapshot: null,
  decisions: [],
  liveAlerts: [],
  liveThreats: [],
  lastMessageAt: null,
};

export const useCommandCentreStore = create<CommandCentreState>((set) => ({
  ...initialState,

  setConnection: (connection) => set({ connection }),

  applyPosition: (update) =>
    set((state) => ({
      positions: { ...state.positions, [update.vehicleId]: update },
      lastMessageAt: Date.now(),
    })),

  applyResponder: (responder) =>
    set((state) => ({
      responders: { ...state.responders, [responder.id]: responder },
      lastMessageAt: Date.now(),
    })),

  applyCamera: (cameraId, cameraState) =>
    set((state) => ({
      cameras: { ...state.cameras, [cameraId]: cameraState },
      lastMessageAt: Date.now(),
    })),

  applyKpis: (kpis) => set({ kpis, lastMessageAt: Date.now() }),

  applySnapshot: (snapshot) => set({ snapshot, lastMessageAt: Date.now() }),

  pushDecision: (decision) =>
    set((state) => ({
      // De-duplicated by id: a reconnect can replay the tail of the stream, and
      // the same recommendation appearing twice would read as two threats.
      decisions: [decision, ...state.decisions.filter((d) => d.id !== decision.id)].slice(
        0,
        MAX_DECISIONS,
      ),
      lastMessageAt: Date.now(),
    })),

  resolveDecision: (decision) =>
    set((state) => ({
      decisions: state.decisions.map((d) => (d.id === decision.id ? decision : d)),
      lastMessageAt: Date.now(),
    })),

  pushAlert: (alert) =>
    set((state) => ({
      liveAlerts: [alert, ...state.liveAlerts.filter((a) => a.id !== alert.id)].slice(
        0,
        MAX_ALERTS,
      ),
      lastMessageAt: Date.now(),
    })),

  dismissAlert: (alertId) =>
    set((state) => ({ liveAlerts: state.liveAlerts.filter((alert) => alert.id !== alertId) })),

  pushThreat: (threat) =>
    set((state) => ({
      liveThreats: [threat, ...state.liveThreats.filter((t) => t.id !== threat.id)].slice(
        0,
        MAX_THREATS,
      ),
      lastMessageAt: Date.now(),
    })),

  reset: () => set(initialState),
}));

/** Live position for one vehicle, or undefined before its first report. */
export const useVehiclePosition = (vehicleId: string): VehiclePositionUpdate | undefined =>
  useCommandCentreStore((state) => state.positions[vehicleId]);

export const useConnectionState = (): ConnectionState =>
  useCommandCentreStore((state) => state.connection);
