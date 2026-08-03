import { io, type Socket } from 'socket.io-client';
import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@aegisdrive/types';
import { webEnv } from '@/config/env';
import { useAuthStore } from '@/stores/auth.store';
import type { ConnectionState, RealtimeDriver, RealtimeHandlers } from './driver';

type AegisSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Socket.IO driver — the real transport.
 *
 * Wraps the connection so that the rest of the app depends on `RealtimeDriver`
 * rather than on Socket.IO directly, which is what allows the simulation to
 * stand in for it without any consumer knowing.
 */
export class SocketIoDriver implements RealtimeDriver {
  readonly kind = 'socket.io' as const;

  private socket: AegisSocket | null = null;

  connect(handlers: RealtimeHandlers, onStateChange: (state: ConnectionState) => void): void {
    const { tokens } = useAuthStore.getState();

    if (!tokens) {
      onStateChange('error');
      return;
    }

    if (this.socket?.connected) return;

    onStateChange('connecting');

    const socket: AegisSocket = io(`${webEnv.realtimeUrl}${REALTIME_NAMESPACE}`, {
      path: '/realtime',
      // Websocket only: the polling fallback re-sends the auth payload on every
      // poll, doubling handshake cost for no benefit on a modern client.
      transports: ['websocket'],
      auth: { token: tokens.accessToken },
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      autoConnect: false,
    });

    socket.on('connect', () => onStateChange('connected'));
    socket.on('disconnect', () => onStateChange('reconnecting'));
    socket.on('connect_error', () => onStateChange('error'));

    socket.io.on('reconnect_attempt', () => {
      // Reconnecting with the token captured at creation fails once it expires,
      // so the freshest one is read at attempt time.
      const current = useAuthStore.getState().tokens;
      if (current) socket.auth = { token: current.accessToken };
      onStateChange('reconnecting');
    });

    // Bind every handler the consumer supplied. The cast is contained here:
    // `Object.entries` cannot preserve the per-key correlation between an event
    // name and its handler signature, but `RealtimeHandlers` already guaranteed
    // it at the call site.
    for (const [event, handler] of Object.entries(handlers)) {
      if (handler) {
        socket.on(event as keyof ServerToClientEvents, handler as never);
      }
    }

    this.socket = socket;
    socket.connect();
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  subscribeVehicle(vehicleId: string): void {
    this.socket?.emit('vehicle:subscribe', vehicleId);
  }

  unsubscribeVehicle(vehicleId: string): void {
    this.socket?.emit('vehicle:unsubscribe', vehicleId);
  }
}
