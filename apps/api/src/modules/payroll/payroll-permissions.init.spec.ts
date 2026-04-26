import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollPermissionsInit } from './payroll-permissions.init';

// Mock runWithRlsContext — runs the callback inline against the supplied
// tx mock so we can assert the per-tenant grants.
const tenantTxes = new Map<string, Record<string, unknown>>();

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn(
    async (
      _prisma: unknown,
      ctx: { tenant_id?: string },
      fn: (tx: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const tenantId = ctx.tenant_id ?? 'unknown';
      const tx = tenantTxes.get(tenantId);
      if (!tx) throw new Error(`No tx mock for tenant ${tenantId}`);
      return fn(tx);
    },
  ),
}));

describe('PayrollPermissionsInit', () => {
  let init: PayrollPermissionsInit;

  const prismaTx = {
    permission: { upsert: jest.fn() },
    tenant: { findMany: jest.fn() },
  };

  const mockPrisma = {
    $transaction: jest.fn(async (fn: (tx: typeof prismaTx) => Promise<unknown>) => fn(prismaTx)),
  } as unknown as PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantTxes.clear();

    const module = await Test.createTestingModule({
      providers: [PayrollPermissionsInit, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    init = module.get(PayrollPermissionsInit);

    // Sensible defaults: two permissions upsert to known ids; one tenant.
    prismaTx.permission.upsert
      .mockResolvedValueOnce({ id: 'perm-mgr', permission_key: 'payroll.manage_attendance' })
      .mockResolvedValueOnce({ id: 'perm-self', permission_key: 'payroll.self_service' });
    prismaTx.tenant.findMany.mockResolvedValue([{ id: 'tenant-A' }]);
  });

  it('should upsert both permissions and grant per role tier', async () => {
    const tenantTx = {
      role: {
        findMany: jest
          .fn()
          // 1st call → admin tier
          .mockResolvedValueOnce([
            { id: 'role-owner', tenant_id: 'tenant-A' },
            { id: 'role-acct', tenant_id: 'tenant-A' },
          ])
          // 2nd call → all roles
          .mockResolvedValueOnce([
            { id: 'role-owner', tenant_id: 'tenant-A' },
            { id: 'role-teacher', tenant_id: 'tenant-A' },
          ]),
      },
      rolePermission: { upsert: jest.fn().mockResolvedValue({}) },
    };
    tenantTxes.set('tenant-A', tenantTx);

    await init.backfill();

    // Admin tier: 2 roles × 1 permission (manage_attendance) = 2 grants
    // All roles: 2 roles × 1 permission (self_service) = 2 grants
    // Total upserts: 4
    expect(tenantTx.rolePermission.upsert).toHaveBeenCalledTimes(4);

    const calls = tenantTx.rolePermission.upsert.mock.calls;
    const adminCalls = calls.filter((c) => c[0].create.permission_id === 'perm-mgr');
    const selfCalls = calls.filter((c) => c[0].create.permission_id === 'perm-self');
    expect(adminCalls).toHaveLength(2);
    expect(selfCalls).toHaveLength(2);
  });

  it('should not throw when a tenant lookup fails — best effort', async () => {
    tenantTxes.set('tenant-A', {
      role: { findMany: jest.fn().mockRejectedValue(new Error('boom')) },
      rolePermission: { upsert: jest.fn() },
    });

    await expect(init.backfill()).resolves.toBeUndefined();
  });

  it('should not throw at startup even if backfill fails entirely', async () => {
    prismaTx.tenant.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(init.onModuleInit()).resolves.toBeUndefined();
  });
});
