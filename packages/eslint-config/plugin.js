const noEmptyCatch = require('./rules/no-empty-catch');
const noPhysicalCssDirection = require('./rules/no-physical-css-direction');
const noRawSqlOutsideRls = require('./rules/no-raw-sql-outside-rls');
const noSequentialTransaction = require('./rules/no-sequential-transaction');

module.exports = {
  rules: {
    'no-empty-catch': noEmptyCatch,
    'no-physical-css-direction': noPhysicalCssDirection,
    'no-raw-sql-outside-rls': noRawSqlOutsideRls,
    'no-sequential-transaction': noSequentialTransaction,
  },
};
