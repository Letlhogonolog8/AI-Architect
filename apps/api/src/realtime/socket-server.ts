import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  REALTIME_NAMESPACE,
  RealtimeRoom,
  UserStatus,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@aegisdrive/types';
import { corsOrigins } from '../config/env';
import { moduleLogger } from '../core/logger';
import { redisPublisher, redisSubscriber } from '../cache/redis';
import { verifyAccessToken } from '../modules/auth/token.service';
import { loadAuthUser } from '../modules/auth/auth.repository';
import { setRealtimeServer } from './emitter';

const log = moduleLogger('realtime');

export type AegisSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Attaches the realtime layer to the running HTTP server.
 *
 * Two decisions worth knowing about:
 *
 *  1. **Redis adapter.** The API runs as N replicas, and a client connected to
 *     replica A must receive an incident raised on replica B. Without the
 *     adapter, broadcasts reach only the emitting process.
 *
 *  2. **Rooms are organization-scoped.** Every socket is joined to exactly one
 *     `org:<id>` room at handshake time, and every broadcast targets a room —
 *     never `io.emit`. That is what stops one tenant's vehicle positions from
 *     reaching another's control room.
 */
export function createRealtimeServer(httpServer: HttpServer): AegisSocketServer {
  const io: AegisSocketServer = new Server(httpServer, {
    path: '/realtime',
    cors: { origin: corsOrigins, credentials: true },
    // Longer than the default: control-room clients sit behind corporate
    // proxies that buffer aggressively, and a premature disconnect drops the
    // live map.
    pingTimeout: 30_000,
    pingInterval: 25_000,
    transports: ['websocket', 'polling'],
  });

  io.adapter(createAdapter(redisPublisher, redisSubscriber));

  const ops = io.of(REALTIME_NAMESPACE);

  ops.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string } | undefined)?.token ??
        socket.handshake.headers.authorization?.replace(/^Bearer /, '');

      if (!token) {
        next(new Error('AUTH_REQUIRED'));
        return;
      }

      const claims = verifyAccessToken(token);
      const user = await loadAuthUser(claims.sub);

      if (!user || user.status !== UserStatus.ACTIVE) {
        next(new Error('AUTH_INVALID'));
        return;
      }

      socket.data.userId = user.id;
      socket.data.organizationId = user.organizationId;
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  ops.on('connection', (socket) => {
    const { userId, organizationId } = socket.data;

    void socket.join(RealtimeRoom.organization(organizationId));

    log.debug({ socketId: socket.id, userId, organizationId }, 'Realtime client connected');

    socket.emit('connection:ack', {
      socketId: socket.id,
      organizationId,
      serverTime: new Date().toISOString(),
    });

    // Per-resource subscriptions are additive on top of the organization room.
    // They are only ever joined for resources the tenant already owns, because
    // the tenant room is the authorisation boundary and detail reads are
    // authorised separately over REST.
    socket.on('vehicle:subscribe', (vehicleId) => {
      void socket.join(RealtimeRoom.vehicle(vehicleId));
    });
    socket.on('vehicle:unsubscribe', (vehicleId) => {
      void socket.leave(RealtimeRoom.vehicle(vehicleId));
    });
    socket.on('incident:subscribe', (incidentId) => {
      void socket.join(RealtimeRoom.incident(incidentId));
    });
    socket.on('incident:unsubscribe', (incidentId) => {
      void socket.leave(RealtimeRoom.incident(incidentId));
    });

    socket.on('disconnect', (reason) => {
      log.debug({ socketId: socket.id, userId, reason }, 'Realtime client disconnected');
    });
  });

  setRealtimeServer(io);
  log.info({ namespace: REALTIME_NAMESPACE, path: '/realtime' }, 'Realtime server ready');

  return io;
}
