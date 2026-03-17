const { RuleTester } = require('eslint');
const rule = require('../rules/no-sequential-transaction');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-sequential-transaction', rule, {
  valid: [
    // Interactive transaction (allowed)
    {
      code: `prisma.$transaction(async (tx) => { await tx.user.create({ data: {} }); });`,
    },
    // Interactive transaction with arrow
    {
      code: `prisma.$transaction(async tx => { await tx.user.findMany(); });`,
    },
    // Non-prisma transaction-like call
    {
      code: `db.transaction(async () => {});`,
    },
  ],
  invalid: [
    // Array-based transaction (blocked)
    {
      code: `prisma.$transaction([prisma.user.create({ data: {} }), prisma.post.create({ data: {} })]);`,
      errors: [{ messageId: 'noSequentialTransaction' }],
    },
    // Array-based with variable
    {
      code: `const result = prisma.$transaction([query1, query2]);`,
      errors: [{ messageId: 'noSequentialTransaction' }],
    },
  ],
});

console.log('no-sequential-transaction: all tests passed');
