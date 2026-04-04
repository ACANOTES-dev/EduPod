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
  // Coverage baselines measured 2026-04-04 (post Wave 2A+2B): stmts 83.9%, branch 65.8%, fn 84.5%, lines 84.5%
  // Thresholds set at baseline minus 2% — ratchet enforced per health recovery plan
  coverageThreshold: {
    global: {
      statements: 81,
      branches: 63,
      functions: 82,
      lines: 82,
    },
  },
};
