/**
 * E2E tests never touch development data: they use `<db>_test` and Redis DB 1,
 * unless TEST_DATABASE_URL / TEST_REDIS_URL are provided (e.g. in CI).
 */
export function applyTestEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // CI provides variables directly.
  }

  process.env['NODE_ENV'] = 'test';
  process.env['THROTTLE_ENABLED'] ??= 'false';
  process.env['JWT_ACCESS_SECRET'] ??= 'test-secret-that-is-long-enough-for-validation-0123456789';
  process.env['FRONTEND_ORIGIN'] ??= 'http://localhost:3000';

  process.env['DATABASE_URL'] =
    process.env['TEST_DATABASE_URL'] ?? toTestDatabaseUrl(requireEnv('DATABASE_URL'));
  process.env['REDIS_URL'] =
    process.env['TEST_REDIS_URL'] ?? toTestRedisUrl(requireEnv('REDIS_URL'));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (copy backend/.env.example to backend/.env)`);
  return value;
}

function toTestDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) parsed.pathname = `/${database}_test`;
  return parsed.toString();
}

function toTestRedisUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/1';
  return parsed.toString();
}
