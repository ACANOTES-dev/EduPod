/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['/node_modules/'],
  testRegex: ['\\.rls\\.spec\\.ts$'],
  collectCoverage: false,
};
