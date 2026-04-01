const maxPublicMethods = require('./rules/max-public-methods');
const noEmptyCatch = require('./rules/no-empty-catch');
const noHandRolledForms = require('./rules/no-hand-rolled-forms');
const noPhysicalCssDirection = require('./rules/no-physical-css-direction');
const noRawSqlOutsideRls = require('./rules/no-raw-sql-outside-rls');
const noSequentialTransaction = require('./rules/no-sequential-transaction');
const noUntranslatedStrings = require('./rules/no-untranslated-strings');

module.exports = {
  rules: {
    'max-public-methods': maxPublicMethods,
    'no-empty-catch': noEmptyCatch,
    'no-hand-rolled-forms': noHandRolledForms,
    'no-physical-css-direction': noPhysicalCssDirection,
    'no-raw-sql-outside-rls': noRawSqlOutsideRls,
    'no-sequential-transaction': noSequentialTransaction,
    'no-untranslated-strings': noUntranslatedStrings,
  },
};
