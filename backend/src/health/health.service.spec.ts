import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { DEPENDENCY_CHECK_TIMEOUT_MS, HealthService } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = jest.fn<() => Promise<unknown>>();
  const ping = jest.fn<() => Promise<string>>();
  let service: HealthService;

  beforeEach(async () => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: REDIS_CLIENT, useValue: { ping } },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports liveness without touching dependencies', () => {
    const liveness = service.getLiveness();

    expect(liveness.status).toBe('ok');
    expect(queryRaw).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it('is ready when PostgreSQL and Redis respond', async () => {
    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('reports the database as down when the query fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'up' },
    });
  });

  it('reports Redis as down when PING does not answer in time', async () => {
    jest.useFakeTimers();
    ping.mockReturnValue(new Promise<string>(() => undefined));

    const readiness = service.getReadiness();
    await jest.advanceTimersByTimeAsync(DEPENDENCY_CHECK_TIMEOUT_MS + 1);

    await expect(readiness).resolves.toEqual({
      status: 'error',
      checks: { database: 'up', redis: 'down' },
    });
  });
});
