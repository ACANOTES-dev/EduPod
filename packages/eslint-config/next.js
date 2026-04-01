/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./index.js'],
  plugins: ['school'],
  rules: {
    'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    'school/no-hand-rolled-forms': 'warn',
    'school/no-physical-css-direction': 'error',
    'school/no-untranslated-strings': 'warn',
  },
};
