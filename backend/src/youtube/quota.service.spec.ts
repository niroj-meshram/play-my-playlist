import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { QuotaService, quotaDay } from './quota.service.js';

/** Just enough of ioredis for QuotaService. */
function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    store,
    mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
    multi() {
      const ops: (() => void)[] = [];
      const chain = {
        incrby(k: string, n: number) {
          ops.push(() => store.set(k, String(Number(store.get(k) ?? 0) + n)));
          return chain;
        },
        expire() {
          return chain;
        },
        async exec() {
          ops.forEach((op) => op());
          return [];
        },
      };
      return chain;
    },
  };
  return redis;
}

const config = (units: number) => ({ get: () => units }) as unknown as ConfigService<never, true>;

describe('quotaDay', () => {
  it('uses the Pacific calendar day, when YouTube resets quotas', () => {
    // 07:59 UTC on the 2nd is still the 1st in Los Angeles (UTC-8 in winter).
    expect(quotaDay(new Date('2026-01-02T07:59:00Z'))).toBe('2026-01-01');
    expect(quotaDay(new Date('2026-01-02T08:00:00Z'))).toBe('2026-01-02');
  });
});

describe('QuotaService', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it('tracks usage against the daily budget', async () => {
    const quota = new QuotaService(fakeRedis() as unknown as Redis, config(20));

    expect(await quota.hasBudget(9, now)).toBe(true);
    await quota.consume(12, now);
    expect(await quota.hasBudget(8, now)).toBe(true);
    expect(await quota.hasBudget(9, now)).toBe(false);
  });

  it('refuses everything once YouTube reports the quota exhausted', async () => {
    const quota = new QuotaService(fakeRedis() as unknown as Redis, config(10_000));

    await quota.markExhausted(now);

    expect(await quota.hasBudget(1, now)).toBe(false);
    // The next Pacific day starts fresh.
    expect(await quota.hasBudget(1, new Date('2026-03-11T12:00:00Z'))).toBe(true);
  });
});
