/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./index.js'],
  plugins: ['school'],
  rules: {
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'school/max-public-methods': ['warn', { max: 15 }],
    'school/no-sequential-transaction': 'error',
    'school/no-raw-sql-outside-rls': 'error',
    'school/no-cross-module-internal-import': 'warn',
  },
};
