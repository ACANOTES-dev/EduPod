/** @type {import('jest').Config} */
module.exports = {
  collectCoverage: false,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.integration-spec.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};
