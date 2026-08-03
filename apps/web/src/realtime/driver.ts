import type { ServerToClientEvents } from '@aegisdrive/types';

/**
 * The realtime transport contract.
 *
 * `SocketIoDriver` connects to the API; `SimulatedDriver` drives the in-browser
 * simulation. Both deliver the **same** `ServerToClientEvents` payloads, which
 * is the property that makes the mock worth having: consumers cannot tell them
 * apart, so code written against the simulation works unchanged against the
 * real server.
 *
 * Handlers are partial — a consumer subscribes only to the channels it renders.
 */
export type RealtimeHandlers = {
  [K in keyof ServerToClientEvents]?: ServerToClientEvents[K];
};

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface RealtimeDriver {
  readonly kind: 'socket.io' | 'simulated';
  connect(handlers: RealtimeHandlers, onStateChange: (state: ConnectionState) => void): void;
  disconnect(): void;
  /** Joins a per-resource room. A no-op for the simulation, which has no rooms. */
  subscribeVehicle(vehicleId: string): void;
  unsubscribeVehicle(vehicleId: string): void;
}
