import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RateLimitError } from '@aegisdrive/shared';
import { rateLimit } from './rate-limit.middleware';

// `vi.mock` factories are hoisted above every import in the file, so the mock
// object itself must be created through `vi.hoisted` — a plain `const` here
// would still be in its temporal dead zone when the factory runs.
const redisMock = vi.hoisted(() => ({
  incr: vi.fn<(key: string) => Promise<number>>(),
  expire: vi.fn<(key: string, seconds: number) => Promise<number>>(),
}));

vi.mock('../cache/redis', () => ({ redis: redisMock }));

function makeReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ip: '203.0.113.5', ...overrides } as Request;
}

function makeRes(): Response {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    getHeader: (name: string) => headers[name],
  } as unknown as Response;
}

describe('rateLimit', () => {
  beforeEach(() => {
    redisMock.incr.mockReset();
    redisMock.expire.mockReset();
  });

  it('allows a request under the limit and publishes the remaining budget', async () => {
    redisMock.incr.mockResolvedValue(1);
    const middleware = rateLimit({ max: 5, windowSeconds: 60 });
    const res = makeRes();
    const next = vi.fn();

    await middleware(makeReq(), res, next);

    // First hit in the window: the TTL is set exactly once, not on every request.
    expect(redisMock.expire).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '4');
  });

  it('does not re-arm the TTL on subsequent requests within the same window', async () => {
    redisMock.incr.mockResolvedValue(2);
    const middleware = rateLimit({ max: 5, windowSeconds: 60 });

    await middleware(makeReq(), makeRes(), vi.fn());

    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it('rejects with a RateLimitError once the count exceeds max', async () => {
    redisMock.incr.mockResolvedValue(6);
    const middleware = rateLimit({ max: 5, windowSeconds: 60 });
    const next = vi.fn();

    await middleware(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(RateLimitError);
  });

  it('keys authenticated callers by user id rather than IP', async () => {
    redisMock.incr.mockResolvedValue(1);
    const middleware = rateLimit({ bucket: 'test', max: 5, windowSeconds: 60 });
    const req = makeReq({ user: { id: 'user-42' } as never });

    await middleware(req, makeRes(), vi.fn());

    const key = redisMock.incr.mock.calls[0]?.[0];
    expect(key).toContain('ratelimit:test:user-42:');
  });

  it('keys anonymous callers by IP', async () => {
    redisMock.incr.mockResolvedValue(1);
    const middleware = rateLimit({ bucket: 'test', max: 5, windowSeconds: 60 });

    await middleware(makeReq({ ip: '198.51.100.7' }), makeRes(), vi.fn());

    const key = redisMock.incr.mock.calls[0]?.[0];
    expect(key).toContain('ratelimit:test:198.51.100.7:');
  });

  it('fails open when Redis is unreachable, degrading protection rather than availability', async () => {
    redisMock.incr.mockRejectedValue(new Error('ECONNREFUSED'));
    const middleware = rateLimit({ max: 5 });
    const next = vi.fn();

    await middleware(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledWith();
  });
});
