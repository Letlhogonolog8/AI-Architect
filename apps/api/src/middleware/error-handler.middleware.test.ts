import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  AppError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from '@aegisdrive/shared';
import { errorHandler, notFoundHandler } from './error-handler.middleware';

function makeReq(): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/vehicles/123',
    path: '/api/v1/vehicles/123',
  } as Request;
}

function makeRes(): Response & { body?: unknown } {
  const res = {} as Response & { body?: unknown };
  res.headersSent = false;
  res.status = vi.fn(() => res) as unknown as Response['status'];
  res.setHeader = vi.fn() as unknown as Response['setHeader'];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  return res;
}

describe('notFoundHandler', () => {
  it('forwards a NotFoundError naming the unmatched route', () => {
    const next = vi.fn();

    notFoundHandler(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('GET /api/v1/vehicles/123');
  });
});

describe('errorHandler', () => {
  it('renders an operational AppError with its declared status and message', () => {
    const res = makeRes();

    errorHandler(
      new ForbiddenError('You do not have access to this fleet.'),
      makeReq(),
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: ErrorCode.FORBIDDEN, message: 'You do not have access to this fleet.' },
    });
  });

  it('translates a ZodError into a 400 with field-level details', () => {
    const schema = z.object({ email: z.string().email() });
    const parseResult = schema.safeParse({ email: 'not-an-email' });
    if (parseResult.success) throw new Error('expected validation to fail');

    const res = makeRes();
    errorHandler(parseResult.error, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('masks a non-operational error behind a generic message', () => {
    const res = makeRes();
    // A bare Error is not an AppError, so normalise() treats it as an
    // unexpected 500 — the one class of failure that must never leak detail.
    errorHandler(new Error('leaked implementation detail'), makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.body as { error: { message: string } };
    expect(body.error.message).not.toContain('leaked implementation detail');
    expect(body.error.message).toBe('An unexpected error occurred.');
  });

  it('sets Retry-After for a rate limit rejection', () => {
    const res = makeRes();
    const error = new RateLimitError(42, 'Too many requests.', ErrorCode.RATE_LIMITED);

    errorHandler(error, makeReq(), res, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('forwards to next rather than double-sending once headers are already sent', () => {
    const res = makeRes();
    res.headersSent = true;
    const next = vi.fn();
    const error = new Error('too late');

    errorHandler(error, makeReq(), res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
