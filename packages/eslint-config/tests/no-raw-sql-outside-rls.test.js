const { RuleTester } = require('eslint');
const rule = require('../rules/no-raw-sql-outside-rls');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-raw-sql-outside-rls', rule, {
  valid: [
    // ─── Regular Prisma queries (always allowed) ────────────────────────────────
    {
      code: `prisma.user.findMany();`,
    },

    // ─── Unsafe variants in allowlisted files ───────────────────────────────────
    {
      code: `prisma.$executeRawUnsafe('SET LOCAL ...');`,
      filename: 'src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$queryRawUnsafe('SELECT ...');`,
      filename: 'rls-setup.ts',
    },

    // ─── Tagged template $executeRaw in allowlisted files ───────────────────────
    {
      code: `prisma.$executeRaw\`SET LOCAL app.current_tenant_id = ...\`;`,
      filename: 'src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$queryRaw\`SELECT 1\`;`,
      filename: 'tenant-aware-job.ts',
    },
    {
      code: `prisma.$executeRaw\`ALTER TABLE ...\`;`,
      filename: 'packages/prisma/migrations/20240101_add_tables/migration.sql.ts',
    },
    {
      code: `prisma.$queryRaw\`SELECT * FROM users\`;`,
      filename: 'src/modules/users/users.service.spec.ts',
    },
    {
      code: `prisma.$executeRaw\`TRUNCATE TABLE test_data\`;`,
      filename: 'src/modules/users/users.service.test.ts',
    },
    {
      code: `prisma.$executeRaw\`SELECT 1\`;`,
      filename: 'packages/prisma/scripts/audit-rls.ts',
    },

    // ─── Function-call $executeRaw/$queryRaw in allowlisted files ───────────────
    {
      code: `prisma.$executeRaw(Prisma.sql\`SELECT 1\`);`,
      filename: 'src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$queryRaw(Prisma.sql\`SELECT 1\`);`,
      filename: 'tenant-aware-job.ts',
    },
  ],
  invalid: [
    // ─── Unsafe variants in regular service files ───────────────────────────────
    {
      code: `prisma.$executeRawUnsafe('DROP TABLE users');`,
      filename: 'src/modules/users/users.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$executeRawUnsafe' } }],
    },
    {
      code: `prisma.$queryRawUnsafe('SELECT * FROM users');`,
      filename: 'src/modules/health/health.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$queryRawUnsafe' } }],
    },

    // ─── Tagged template $executeRaw/$queryRaw in regular service files ─────────
    {
      code: `prisma.$executeRaw\`DELETE FROM students\`;`,
      filename: 'src/modules/students/students.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$executeRaw' } }],
    },
    {
      code: `prisma.$queryRaw\`SELECT * FROM tenants\`;`,
      filename: 'src/modules/tenants/tenants.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$queryRaw' } }],
    },

    // ─── Function-call $executeRaw/$queryRaw in regular service files ───────────
    {
      code: `prisma.$executeRaw(Prisma.sql\`UPDATE students SET ...\`);`,
      filename: 'src/modules/students/students.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$executeRaw' } }],
    },
    {
      code: `prisma.$queryRaw(Prisma.sql\`SELECT * FROM staff\`);`,
      filename: 'src/modules/staff/staff.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$queryRaw' } }],
    },
  ],
});

console.log('no-raw-sql-outside-rls: all tests passed');
