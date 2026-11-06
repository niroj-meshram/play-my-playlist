import { describe, expect, it } from '@jest/globals';
import { validateEnv } from './env.validation.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '4100',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6379',
  FRONTEND_ORIGIN: 'http://localhost:3000',
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

  it('rejects an out-of-range port', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
