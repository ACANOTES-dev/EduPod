const noCrossModuleInternalImport = require('./rules/no-cross-module-internal-import');
const noEmptyCatch = require('./rules/no-empty-catch');
const noHandRolledForms = require('./rules/no-hand-rolled-forms');
const noPhysicalCssDirection = require('./rules/no-physical-css-direction');
const noRawSqlOutsideRls = require('./rules/no-raw-sql-outside-rls');
const noSequentialTransaction = require('./rules/no-sequential-transaction');
const noUntranslatedStrings = require('./rules/no-untranslated-strings');

module.exports = {
  rules: {
    'no-cross-module-internal-import': noCrossModuleInternalImport,
    'no-empty-catch': noEmptyCatch,
    'no-hand-rolled-forms': noHandRolledForms,
    'no-physical-css-direction': noPhysicalCssDirection,
    'no-raw-sql-outside-rls': noRawSqlOutsideRls,
    'no-sequential-transaction': noSequentialTransaction,
    'no-untranslated-strings': noUntranslatedStrings,
  },
};
