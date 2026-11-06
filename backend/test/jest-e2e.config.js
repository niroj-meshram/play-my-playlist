/**
 * End-to-end tests boot the real application against PostgreSQL and Redis
 * (`pnpm infra:up` from the repository root). They use a separate `_test`
 * database and Redis DB 1, and run serially because suites reset shared state.
 * @type {import('jest').Config}
 */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  setupFiles: ['reflect-metadata', '<rootDir>/test/setup/setup-env.js'],
  globalSetup: '<rootDir>/test/setup/global-setup.js',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  maxWorkers: 1,
  testTimeout: 20000,
};
