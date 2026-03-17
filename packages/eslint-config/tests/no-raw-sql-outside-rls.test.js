const { RuleTester } = require('eslint');
const rule = require('../rules/no-raw-sql-outside-rls');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-raw-sql-outside-rls', rule, {
  valid: [
    // Regular Prisma query (allowed)
    {
      code: `prisma.user.findMany();`,
    },
    // $executeRaw (safe version, allowed)
    {
      code: `prisma.$executeRaw\`SELECT 1\`;`,
    },
    // In an RLS file (allowed) — simulated by filename
    {
      code: `prisma.$executeRawUnsafe('SET LOCAL ...');`,
      filename: 'src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$queryRawUnsafe('SELECT ...');`,
      filename: 'rls-setup.ts',
    },
  ],
  invalid: [
    {
      code: `prisma.$executeRawUnsafe('DROP TABLE users');`,
      filename: 'src/modules/users/users.service.ts',
      errors: [{ messageId: 'noRawSql' }],
    },
    {
      code: `prisma.$queryRawUnsafe('SELECT * FROM users');`,
      filename: 'src/modules/health/health.service.ts',
      errors: [{ messageId: 'noRawSql' }],
    },
  ],
});

console.log('no-raw-sql-outside-rls: all tests passed');
