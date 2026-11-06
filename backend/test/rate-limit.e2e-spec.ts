import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@pmp/shared';
import type { TestApp } from './utils/test-app.js';

// Rate limiting is disabled for the other e2e suites; enable it before the app module loads.
process.env['THROTTLE_ENABLED'] = 'true';
const { createTestApp } = await import('./utils/test-app.js');
const { http } = await import('./utils/api.js');

describe('Rate limiting (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reset();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('limits guest-session creation per client IP and returns the error envelope', async () => {
    const attempt = (i: number) =>
      http(t.app)
        .post('/api/v1/auth/guest')
        .send({ displayName: `Bot ${i}`, avatarId: 'avatar-01' });

    for (let i = 0; i < 10; i += 1) {
      await attempt(i).expect(201);
    }
    const blocked = await attempt(10).expect(429);

    expect(blocked.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(blocked.headers['retry-after-default'] ?? blocked.headers['retry-after']).toBeDefined();
  });

  it('never rate-limits health checks', async () => {
    for (let i = 0; i < 150; i += 1) {
      await http(t.app).get('/api/v1/health').expect(200);
    }
  });

  it('stores counters in Redis so limits are shared across API instances', async () => {
    const keys = await t.redis.keys('throttle:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});
