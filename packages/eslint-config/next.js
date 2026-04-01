/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./index.js'],
  plugins: ['school'],
  rules: {
    'school/no-hand-rolled-forms': 'warn',
    'school/no-physical-css-direction': 'error',
    'school/no-untranslated-strings': 'warn',
  },
};
