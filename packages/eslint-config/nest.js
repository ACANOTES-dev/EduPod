/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./index.js'],
  plugins: ['school'],
  rules: {
    'school/no-sequential-transaction': 'error',
    'school/no-raw-sql-outside-rls': 'error',
  },
};
