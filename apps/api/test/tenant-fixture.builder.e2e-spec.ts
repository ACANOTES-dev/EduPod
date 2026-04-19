/* eslint-disable school/no-raw-sql-outside-rls -- test setup/teardown bypasses RLS */
import { PrismaClient } from '@prisma/client';

import {
  createTenantFixture,
  deleteTenantFixture,
  FIXTURE_PASSWORD,
} from './tenant-fixture.builder';

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

  describe('bare mode (authReady: false)', () => {
    it('creates base entities without users/roles/modules', async () => {
      const fixture = await createTenantFixture(prisma, {
        slug: `bare-${Date.now()}`,
        authReady: false,
      });

      expect(fixture.tenantId).toBeDefined();
      expect(fixture.ownerUserId).toBeDefined();
      expect(fixture.studentId).toBeDefined();
      expect(fixture.classId).toBeDefined();
      expect(fixture.adminUserId).toBeUndefined();
      expect(fixture.teacherUserId).toBeUndefined();
      expect(fixture.parentUserId).toBeUndefined();

      const tenantDB = await prisma.tenant.findUnique({ where: { id: fixture.tenantId } });
      expect(tenantDB).not.toBeNull();

      // No modules/roles/settings provisioned
      const modules = await prisma.tenantModule.findMany({
        where: { tenant_id: fixture.tenantId },
      });
      expect(modules).toHaveLength(0);
      const roles = await prisma.role.findMany({ where: { tenant_id: fixture.tenantId } });
      expect(roles).toHaveLength(0);

      await deleteTenantFixture(prisma, fixture);

      const afterDelete = await prisma.tenant.findUnique({ where: { id: fixture.tenantId } });
      expect(afterDelete).toBeNull();
    });
  });

  describe('auth-ready mode (default)', () => {
    it('provisions tenant + all 4 users + roles + modules + permissions', async () => {
      const fixture = await createTenantFixture(prisma, { slug: `authready-${Date.now()}` });

      try {
        expect(fixture.adminUserId).toBeDefined();
        expect(fixture.teacherUserId).toBeDefined();
        expect(fixture.parentUserId).toBeDefined();
        expect(fixture.teacherStaffProfileId).toBeDefined();
        expect(fixture.parentId).toBeDefined();
        expect(fixture.password).toBe(FIXTURE_PASSWORD);

        // Modules: all 16 present, SEN disabled, others enabled
        const modules = await prisma.tenantModule.findMany({
          where: { tenant_id: fixture.tenantId },
        });
        expect(modules).toHaveLength(16);
        const sen = modules.find((m) => m.module_key === 'sen');
        expect(sen?.is_enabled).toBe(false);
        const attendance = modules.find((m) => m.module_key === 'attendance');
        expect(attendance?.is_enabled).toBe(true);

        // Roles: 4 tenant-scoped roles for the 4 users
        const roles = await prisma.role.findMany({
          where: { tenant_id: fixture.tenantId },
        });
        expect(roles.map((r) => r.role_key).sort()).toEqual(
          ['admin', 'parent', 'school_principal', 'teacher'].sort(),
        );

        // Membership roles linked
        const memberships = await prisma.tenantMembership.findMany({
          where: { tenant_id: fixture.tenantId },
          include: { membership_roles: true },
        });
        expect(memberships).toHaveLength(4);
        for (const m of memberships) {
          expect(m.membership_roles).toHaveLength(1);
        }

        // Parent record linked to the parent user
        const parentRec = await prisma.parent.findFirst({
          where: { tenant_id: fixture.tenantId, user_id: fixture.parentUserId },
        });
        expect(parentRec).not.toBeNull();

        // Role permissions exist
        const rolePerms = await prisma.rolePermission.findMany({
          where: { tenant_id: fixture.tenantId },
        });
        expect(rolePerms.length).toBeGreaterThan(20);
      } finally {
        await deleteTenantFixture(prisma, fixture);
      }
    });

    it('respects narrowed users option', async () => {
      const fixture = await createTenantFixture(prisma, {
        slug: `narrow-${Date.now()}`,
        users: ['admin'],
      });

      try {
        expect(fixture.adminUserId).toBeDefined();
        expect(fixture.teacherUserId).toBeUndefined();
        expect(fixture.parentUserId).toBeUndefined();

        // Only the admin role is provisioned
        const roles = await prisma.role.findMany({
          where: { tenant_id: fixture.tenantId },
        });
        expect(roles.map((r) => r.role_key)).toEqual(['admin']);
      } finally {
        await deleteTenantFixture(prisma, fixture);
      }
    });
  });
});
