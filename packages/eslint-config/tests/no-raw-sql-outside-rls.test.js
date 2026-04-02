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

    // ─── Allowlisted files ─────────────────────────────────────────────────────
    {
      code: `prisma.$executeRawUnsafe('SET LOCAL ...');`,
      filename: 'apps/api/src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$executeRaw\`SET LOCAL app.current_tenant_id = ...\`;`,
      filename: 'apps/api/src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$executeRaw\`SELECT set_config(...)\`;`,
      filename: 'apps/worker/src/base/tenant-aware-job.ts',
    },
    {
      code: `prisma.$queryRaw\`SELECT 1\`;`,
      filename: 'apps/api/src/modules/health/health.service.ts',
    },
    {
      code: `prisma.$executeRawUnsafe('CREATE TABLE PARTITION ...');`,
      filename: 'apps/worker/src/processors/behaviour/partition-maintenance.processor.ts',
    },
    {
      code: `prisma.$queryRaw\`SELECT FOR UPDATE ...\`;`,
      filename: 'apps/api/src/modules/sequence/sequence.service.ts',
    },

    // ─── Auto-allowed: test files ──────────────────────────────────────────────
    {
      code: `prisma.$queryRaw\`SELECT * FROM users\`;`,
      filename: 'src/modules/users/users.service.spec.ts',
    },
    {
      code: `prisma.$executeRaw\`TRUNCATE TABLE test_data\`;`,
      filename: 'src/modules/users/users.service.test.ts',
    },

    // ─── Auto-allowed: migration files ─────────────────────────────────────────
    {
      code: `prisma.$executeRaw\`ALTER TABLE ...\`;`,
      filename: 'packages/prisma/migrations/20240101_add_tables/migration.sql.ts',
    },

    // ─── Auto-allowed: seed files ──────────────────────────────────────────────
    {
      code: `prisma.$executeRaw\`INSERT INTO ...\`;`,
      filename: 'packages/prisma/seed/seed.ts',
    },

    // ─── Auto-allowed: SQL files ───────────────────────────────────────────────
    {
      code: `prisma.$executeRaw\`SELECT 1\`;`,
      filename: 'packages/prisma/rls/policies.sql',
    },

    // ─── Function-call $executeRaw/$queryRaw in allowlisted files ──────────────
    {
      code: `prisma.$executeRaw(Prisma.sql\`SELECT 1\`);`,
      filename: 'apps/api/src/common/middleware/rls.middleware.ts',
    },
    {
      code: `prisma.$queryRaw(Prisma.sql\`SELECT 1\`);`,
      filename: 'apps/worker/src/base/tenant-aware-job.ts',
    },
  ],
  invalid: [
    // ─── Non-allowlisted service files ─────────────────────────────────────────
    {
      code: `prisma.$executeRawUnsafe('DROP TABLE users');`,
      filename: 'src/modules/users/users.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$executeRawUnsafe' } }],
    },
    {
      code: `prisma.$queryRawUnsafe('SELECT * FROM users');`,
      filename: 'src/modules/health/other.service.ts',
      errors: [{ messageId: 'noRawSql', data: { method: '$queryRawUnsafe' } }],
    },

    // ─── Tagged template in non-allowlisted files ──────────────────────────────
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

    // ─── Function-call in non-allowlisted files ────────────────────────────────
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
