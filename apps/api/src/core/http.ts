import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiFailure, ApiSuccess, Paginated } from '@aegisdrive/types';
import { getRequestId } from './request-context';

/**
 * Response helpers.
 *
 * Every handler returns through one of these, so the envelope in
 * `@aegisdrive/types` is guaranteed rather than merely documented.
 */

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccess<T> = { success: true, data, requestId: getRequestId() };
  res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T, location?: string): void {
  if (location) res.setHeader('Location', location);
  sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}

export function sendPaginated<T>(res: Response, page: Paginated<T>): void {
  sendSuccess(res, page, 200);
}

export function sendFailure(res: Response, statusCode: number, error: ApiFailure['error']): void {
  const body: ApiFailure = { success: false, error, requestId: getRequestId() };
  res.status(statusCode).json(body);
}

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections from async handlers on its own, but the wrapper
 * stays: it keeps the behaviour explicit at every call site and preserves the
 * handler's parameter types, which the bare form loses.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  handler: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<void>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Client IP, honouring the first hop of `X-Forwarded-For` behind the load balancer. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}
