import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '@aegisdrive/types';

export interface RequestContext {
  requestId: string;
  /** Present once `authenticate` has run. */
  user?: AuthUser;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Ambient per-request state.
 *
 * Used only by cross-cutting concerns — logging and audit writes — that would
 * otherwise need `req` threaded through every service and repository call.
 * Business logic must take what it needs as an explicit parameter; reaching
 * into this store from a service makes that service untestable.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string {
  return storage.getStore()?.requestId ?? 'no-request-context';
}
