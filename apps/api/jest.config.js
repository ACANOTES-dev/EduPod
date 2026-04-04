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
  // Coverage baselines measured 2026-04-04 (post Wave 6D): stmts 83.05%, branch 65.92%, fn 80.83%, lines 83.73%
  // Thresholds set at baseline minus 2% — ratchet enforced per health recovery plan
  coverageThreshold: {
    global: {
      statements: 81,
      branches: 63,
      functions: 78,
      lines: 82,
    },
  },
};
