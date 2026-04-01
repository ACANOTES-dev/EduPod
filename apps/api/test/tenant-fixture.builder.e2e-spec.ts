import { PrismaClient } from '@prisma/client';

import { createTenantFixture } from './tenant-fixture.builder';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

describe('createTenantFixture', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should successfully create a cohesive isolated tenant environment', async () => {
    const fixture = await createTenantFixture(prisma, {
      name: 'Test Tenant Creation',
      slug: `test-builder-${Date.now()}`,
    });

    expect(fixture.tenantId).toBeDefined();
    expect(fixture.ownerUserId).toBeDefined();
    expect(fixture.studentId).toBeDefined();

    const tenantDB = await prisma.tenant.findUnique({ where: { id: fixture.tenantId } });
    expect(tenantDB).not.toBeNull();
    expect(tenantDB?.name).toBe('Test Tenant Creation');

    const staffDB = await prisma.staffProfile.findUnique({ where: { id: fixture.staffProfileId } });
    expect(staffDB?.tenant_id).toBe(fixture.tenantId);

    // Cleanup
    // eslint-disable-next-line school/no-raw-sql-outside-rls
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id = $1::uuid`,
      String(fixture.tenantId),
    );
    // eslint-disable-next-line school/no-raw-sql-outside-rls
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id = $1::uuid`,
      String(fixture.ownerUserId),
    );
  });
});
