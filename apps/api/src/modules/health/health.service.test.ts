import { describe, expect, it, vi } from 'vitest';

const dbMock = vi.fn<() => Promise<boolean>>();
const cacheMock = vi.fn<() => Promise<boolean>>();
const clientCountMock = vi.fn<() => Promise<number>>();

vi.mock('../../db/prisma', () => ({ isDatabaseReachable: dbMock }));
vi.mock('../../cache/redis', () => ({ isCacheReachable: cacheMock }));
vi.mock('../../realtime/emitter', () => ({ connectedClientCount: clientCountMock }));

const { checkHealth } = await import('./health.service');

describe('checkHealth', () => {
  it('reports healthy when both dependencies are up', async () => {
    dbMock.mockResolvedValue(true);
    cacheMock.mockResolvedValue(true);
    clientCountMock.mockResolvedValue(3);

    const report = await checkHealth();

    expect(report.status).toBe('healthy');
    expect(report.dependencies.database.status).toBe('up');
    expect(report.dependencies.cache.status).toBe('up');
    expect(report.realtimeClients).toBe(3);
  });

  it('reports degraded when the database is unreachable, because it is load-bearing', async () => {
    dbMock.mockResolvedValue(false);
    cacheMock.mockResolvedValue(true);
    clientCountMock.mockResolvedValue(0);

    const report = await checkHealth();

    expect(report.status).toBe('degraded');
  });

  it('stays healthy when only the cache is down, since caching is not correctness-critical', async () => {
    dbMock.mockResolvedValue(true);
    cacheMock.mockResolvedValue(false);
    clientCountMock.mockResolvedValue(0);

    const report = await checkHealth();

    expect(report.status).toBe('healthy');
    expect(report.dependencies.cache.status).toBe('down');
  });
});
