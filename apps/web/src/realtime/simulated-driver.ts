import { AIDecisionStatus } from '@aegisdrive/types';
import { getSimulation } from '@/mocks/simulation';
import type { ConnectionState, RealtimeDriver, RealtimeHandlers } from './driver';

/**
 * In-browser realtime driver.
 *
 * Starts the simulation and forwards its events through the same handler map
 * the Socket.IO driver uses. It deliberately mimics two behaviours of a real
 * connection that a naive mock would skip:
 *
 *   1. **Connection is not instantaneous.** A short `connecting` phase means
 *      the UI's connecting state is exercised on every reload rather than only
 *      in production.
 *   2. **Connections drop.** Every few minutes it flips to `reconnecting` for a
 *      couple of seconds. Widgets that assume the socket is always up — stale
 *      data with no indication — fail visibly here rather than in a control
 *      room.
 */
const CONNECT_DELAY_MS = 400;
const DROP_INTERVAL_MS = 180_000;
const DROP_DURATION_MS = 2_500;

export class SimulatedDriver implements RealtimeDriver {
  readonly kind = 'simulated' as const;

  private unsubscribe: (() => void) | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private dropTimer: ReturnType<typeof setInterval> | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;

  connect(handlers: RealtimeHandlers, onStateChange: (state: ConnectionState) => void): void {
    onStateChange('connecting');

    this.connectTimer = setTimeout(() => {
      const simulation = getSimulation();

      handlers['connection:ack']?.({
        socketId: 'simulated',
        organizationId: 'simulated-org',
        serverTime: new Date().toISOString(),
      });

      this.unsubscribe = simulation.subscribe({
        onVehiclePosition: (update) => handlers['vehicle:position']?.(update),
        onResponderUpdated: (responder) => handlers['responder:updated']?.(responder),
        onCameraUpdate: (update) =>
          handlers['camera:update']?.({
            cameraId: update.cameraId,
            status: update.status,
            detections: update.detections,
            lastFrameAt: update.lastFrameAt,
          }),
        onKpiTick: (metrics) => handlers['kpi:tick']?.(metrics),
        onFleetSnapshot: (snapshot) => handlers['fleet:snapshot']?.(snapshot),
        onAIDecision: (decision) => {
          if (decision.status === AIDecisionStatus.PENDING) {
            handlers['ai:decision']?.(decision);
          } else {
            handlers['ai:decision-resolved']?.(decision);
          }
        },
        onAlert: (alert) => handlers['alert:raised']?.(alert),
      });

      simulation.start();
      onStateChange('connected');

      this.dropTimer = setInterval(() => {
        onStateChange('reconnecting');
        this.restoreTimer = setTimeout(() => onStateChange('connected'), DROP_DURATION_MS);
      }, DROP_INTERVAL_MS);
    }, CONNECT_DELAY_MS);
  }

  disconnect(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.dropTimer) clearInterval(this.dropTimer);
    if (this.restoreTimer) clearTimeout(this.restoreTimer);

    this.connectTimer = null;
    this.dropTimer = null;
    this.restoreTimer = null;

    this.unsubscribe?.();
    this.unsubscribe = null;

    // The simulation itself keeps running only if another consumer is attached;
    // with no subscribers it is stopped so a hidden tab does no work.
    getSimulation().stop();
  }

  // The simulation broadcasts everything to every consumer, so per-resource
  // subscription is a no-op. The methods exist so the interface is honoured and
  // callers need no special-casing.
  subscribeVehicle(): void {}
  unsubscribeVehicle(): void {}
}
