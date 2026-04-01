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
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/test/', '/dist/'],
  // Coverage baselines measured 2026-04-01: stmts ~81%, branch ~63%, fn ~83%, lines ~82%
  // Thresholds set at baseline minus 5% — ratchet up over time toward >80% target
  coverageThreshold: {
    global: {
      statements: 76,
      branches: 57,
      functions: 78,
      lines: 77,
    },
  },
};
