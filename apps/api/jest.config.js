/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.rls\\.spec\\.ts$',
    '\\.performance\\.spec\\.ts$',
    '\\.e2e-spec\\.ts$',
    '<rootDir>/test/',
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@school/prisma$': '<rootDir>/../../packages/prisma/src',
    '^@school/prisma/(.*)$': '<rootDir>/../../packages/prisma/src/$1',
    '^@school/shared$': '<rootDir>/../../packages/shared/src',
    '^@school/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
    '!src/main.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'json', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/test/', '/dist/'],
  // Coverage baselines measured 2026-04-05: stmts 90.85%, branch 76.82%, fn 87.58%, lines 91.30%
  // Thresholds set at baseline minus 2% — ratchet enforced per health recovery plan
  // When running sharded in CI (JEST_SHARD_MODE=1), skip threshold check here —
  // thresholds are applied by scripts/merge-coverage-shards.js on merged coverage.
  coverageThreshold:
    process.env.JEST_SHARD_MODE === '1'
      ? undefined
      : {
          global: {
            statements: 88,
            branches: 74,
            functions: 85,
            lines: 89,
          },
        },
};
