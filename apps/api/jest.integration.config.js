/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['/node_modules/'],
  testRegex: [
    '\\.rls\\.spec\\.ts$',
    '\\.performance\\.spec\\.ts$',
    '\\.e2e-spec\\.ts$',
    '/test/[^/]+\\.spec\\.ts$',
  ],
  // Integration tests spin up a full Nest app, run many DB mutations, and
  // hit external services (Redis, BullMQ). Default 5s per hook is too tight
  // under parallel load (beforeAll/afterAll with fixture + multiple API
  // calls exceeds 5s consistently). Lift to 60s by default; individual
  // suites may override via `jest.setTimeout(...)`.
  testTimeout: 60_000,
};
