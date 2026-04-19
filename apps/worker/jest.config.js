/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/worker.module.ts',
  ],
  coverageReporters: ['text', 'lcov', 'json'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 31,
      lines: 28,
      statements: 28,
    },
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@school/prisma$': '<rootDir>/../../packages/prisma/src',
    '^@school/prisma/(.*)$': '<rootDir>/../../packages/prisma/src/$1',
    '^@school/shared$': '<rootDir>/../../packages/shared/src',
    '^@school/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Coverage baselines measured 2026-04-01: stmts ~84%, branch ~63%, fn ~87%, lines ~84%
  // Thresholds set at baseline minus 5% — ratchet up over time toward >70% target.
  // When running sharded in CI (JEST_SHARD_MODE=1), skip threshold check here —
  // thresholds are applied by scripts/merge-coverage-shards.js on merged coverage.
  coverageThreshold:
    process.env.JEST_SHARD_MODE === '1'
      ? undefined
      : {
          global: {
            statements: 78,
            branches: 57,
            functions: 81,
            lines: 78,
          },
        },
};
