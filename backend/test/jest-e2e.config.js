/**
 * End-to-end tests boot the real application against PostgreSQL and Redis
 * (`pnpm infra:up` from the repository root).
 * @type {import('jest').Config}
 */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testTimeout: 20000,
};
