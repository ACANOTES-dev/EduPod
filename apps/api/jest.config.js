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
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/test/', '/dist/'],
  // Coverage baselines measured 2026-04-05: stmts 90.85%, branch 76.82%, fn 87.58%, lines 91.30%
  // Thresholds set at baseline minus 2% — ratchet enforced per health recovery plan
  coverageThreshold: {
    global: {
      statements: 88,
      branches: 74,
      functions: 85,
      lines: 89,
    },
  },
};
