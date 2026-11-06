import { execFileSync } from 'node:child_process';
import { applyTestEnv } from './test-env.js';

/** Creates the test database if needed and applies all migrations once per run. */
export default function globalSetup() {
  applyTestEnv();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
}
