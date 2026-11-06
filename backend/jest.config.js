/**
 * NestJS 12 is ESM-only, so Jest runs in native ESM mode
 * (scripts pass --experimental-vm-modules). Use `jest.unstable_mockModule`
 * or Nest DI overrides instead of `jest.mock` for module mocking.
 * @type {import('jest').Config}
 */
export default {
  rootDir: 'src',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!main.ts', '!generated/**', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
};
