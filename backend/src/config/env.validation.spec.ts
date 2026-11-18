import { describe, expect, it } from '@jest/globals';
import { validateEnv } from './env.validation.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '4100',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6379',
  FRONTEND_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('validateEnv', () => {
  it('accepts a valid environment and converts numeric values', () => {
    const env = validateEnv(valid);

    expect(env.PORT).toBe(4100);
    expect(env.NODE_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('log');
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;

    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a frontend origin that contains a path', () => {
    expect(() => validateEnv({ ...valid, FRONTEND_ORIGIN: 'http://localhost:3000/app' })).toThrow(
      /FRONTEND_ORIGIN/,
    );
  });

  it('applies auth and rate-limit defaults', () => {
    const env = validateEnv(valid);

    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.THROTTLE_ENABLED).toBe(true);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('refuses to disable rate limiting in production', () => {
    expect(() =>
      validateEnv({ ...valid, NODE_ENV: 'production', THROTTLE_ENABLED: 'false' }),
    ).toThrow(/THROTTLE_ENABLED/);
    expect(validateEnv({ ...valid, THROTTLE_ENABLED: 'false' }).THROTTLE_ENABLED).toBe(false);
  });

  it('rejects an out-of-range port', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
  it('applies presence timer defaults and requires the debounce to be shorter than the grace', () => {
    const env = validateEnv(valid);
    expect(env.PRESENCE_GRACE_MS).toBe(30_000);
    expect(env.PRESENCE_DEBOUNCE_MS).toBe(5_000);
    expect(env.GRACE_SWEEP_INTERVAL_MS).toBe(1_000);

    expect(() =>
      validateEnv({ ...valid, PRESENCE_GRACE_MS: '1000', PRESENCE_DEBOUNCE_MS: '1000' }),
    ).toThrow(/PRESENCE_DEBOUNCE_MS/);
  });

  it('treats an empty YouTube key as unset, but requires one in production', () => {
    expect(validateEnv({ ...valid, YOUTUBE_API_KEY: '' }).YOUTUBE_API_KEY).toBeUndefined();
    expect(
      validateEnv({ ...valid, YOUTUBE_DAILY_QUOTA_UNITS: '500' }).YOUTUBE_DAILY_QUOTA_UNITS,
    ).toBe(500);
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/YOUTUBE_API_KEY/);
    expect(() => validateEnv({ ...valid, YOUTUBE_REGION_CODE: 'india' })).toThrow(
      /YOUTUBE_REGION_CODE/,
    );
  });
});
