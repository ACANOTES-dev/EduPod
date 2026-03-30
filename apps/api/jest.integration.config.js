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
};
