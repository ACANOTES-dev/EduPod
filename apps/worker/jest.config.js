/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Coverage baselines measured 2026-04-01: stmts ~84%, branch ~63%, fn ~87%, lines ~84%
  // Thresholds set at baseline minus 5% — ratchet up over time toward >70% target
  coverageThreshold: {
    global: {
      statements: 78,
      branches: 58,
      functions: 81,
      lines: 78,
    },
  },
};
