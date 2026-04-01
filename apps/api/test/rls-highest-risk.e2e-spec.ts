/* eslint-disable school/no-raw-sql-outside-rls -- RLS e2e tests require direct SQL for setup/teardown */
import { PrismaClient } from '@prisma/client';

import { createTenantFixture, TenantFixture } from './tenant-fixture.builder';

/**
 * BT-10: Highest-Risk Tables RLS Smoke Tests
 * Ensures strict multi-tenant boundary isolation across sensitive tables
 * when actually populated with data.
 */
describe('Highest-Risk Tables RLS Leakage Preventer', () => {
  let prisma: PrismaClient;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });

    // Create totally isolated tenant environments using our new fixture builder
    tenantA = await createTenantFixture(prisma, { slug: `rls-a-${Date.now()}` });
    tenantB = await createTenantFixture(prisma, { slug: `rls-b-${Date.now()}` });

    // Seed Tenant A with high-risk sensitive data
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rls_test_user_p10') THEN
          CREATE ROLE rls_test_user_p10 NOINHERIT;
        END IF;
      END
      $$;
    `);

    // Ensure the role can read/write the tables it needs
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO rls_test_user_p10;`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO rls_test_user_p10;`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT INSERT, UPDATE ON TABLE public.invoices, public.attendance_sessions TO rls_test_user_p10;`,
    );

    // Seed Tenant A with high-risk sensitive data
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO public.invoices (id, tenant_id, household_id, invoice_number, status, due_date, subtotal_amount, discount_amount, total_amount, balance_amount, currency_code, created_by_user_id)
      VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'INV-A-123', 'draft', NOW(), 100, 0, 100, 100, 'EUR', $3::uuid)
    `,
      tenantA.tenantId,
      tenantA.householdId,
      tenantA.ownerUserId,
    );

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO public.attendance_sessions (id, tenant_id, class_id, session_date, submitted_by_user_id, status)
      VALUES (gen_random_uuid(), $1::uuid, $2::uuid, NOW(), $3::uuid, 'open')
    `,
      tenantA.tenantId,
      tenantA.classId,
      tenantA.ownerUserId,
    );
  });

  afterAll(async () => {
    // Cleanup fixtures
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = $1::uuid`, tenantA.tenantId);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = $1::uuid`, tenantB.tenantId);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, tenantA.ownerUserId);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, tenantB.ownerUserId);
    await prisma.$disconnect();
  });

  it('should completely isolate Tenant A data from Tenant B when fetching invoices (Finance)', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        tenantB.tenantId,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE rls_test_user_p10`);

      const allBInvoices = await tx.invoice.findMany();
      expect(allBInvoices.length).toBe(0);
    });
  });

  it('should absolutely isolate Tenant A data from Tenant B when fetching attendance (P4A)', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        tenantB.tenantId,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE rls_test_user_p10`);

      const allBAttendance = await tx.attendanceSession.findMany();
      expect(allBAttendance.length).toBe(0);
    });
  });

  it('should verify Tenant B cannot write records assigned to Tenant A', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          tenantB.tenantId,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE rls_test_user_p10`);

        await tx.attendanceSession.create({
          data: {
            tenant: { connect: { id: tenantA.tenantId } },
            class_entity: { connect: { id: tenantA.classId } },
            session_date: new Date(),
            submitted_by: { connect: { id: tenantB.ownerUserId } },
            status: 'open',
          },
        });
      }),
    ).rejects.toThrow();
  });
});
