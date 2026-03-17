const noSequentialTransaction = require('./rules/no-sequential-transaction');
const noRawSqlOutsideRls = require('./rules/no-raw-sql-outside-rls');
const noPhysicalCssDirection = require('./rules/no-physical-css-direction');

module.exports = {
  rules: {
    'no-sequential-transaction': noSequentialTransaction,
    'no-raw-sql-outside-rls': noRawSqlOutsideRls,
    'no-physical-css-direction': noPhysicalCssDirection,
  },
};
