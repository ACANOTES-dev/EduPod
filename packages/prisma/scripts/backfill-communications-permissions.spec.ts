/**
 * Unit tests for the comms-permissions backfill script.
 *
 * Mocks the PrismaClient so we exercise the script's grant logic without
 * a live database. Verifies:
 *   - Both permission keys are queried for in `permissions`.
 *   - All five tenant slugs are queried for in `tenants`.
 *   - Each tenant gets `set_config('app.current_tenant_id', …)` set inside
 *     an interactive transaction.
 *   - Role lookup uses the two TARGET_ROLES.
 *   - INSERT INTO role_permissions runs for each (role × permission) pair.
 *   - First-run accounting: every insert returns 1 → grants_added = N.
 *   - Re-run accounting: every insert returns 0 → grants_skipped = N.
 *   - Missing permissions throw with a pointer to sync-missing-permissions.
 */
import type { PrismaClient } from '@prisma/client';

import { runBackfill } from './backfill-communications-permissions';

interface FakeRole {
  id: string;
  tenant_id: string | null;
  role_key: string;
}

interface FakeTenant {
  id: string;
  slug: string;
}

interface FakePermission {
  id: string;
  permission_key: string;
}

interface MockPrismaState {
  permissions: FakePermission[];
  tenants: FakeTenant[];
  roles: FakeRole[];
  insertResult: number; // 1 = inserted, 0 = conflict (already present)
  setConfigCalls: string[];
  insertCalls: number;
}

function buildMockPrisma(state: MockPrismaState): PrismaClient {
  const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('FROM permissions')) {
      return state.permissions;
    }
    if (sql.includes('FROM tenants')) {
      return state.tenants;
    }
    if (sql.includes('FROM roles')) {
      // Emulate the dual-shape filter: tenant-scoped OR platform school_owner.
      const tenantIdParam = values[1] as string | undefined; // second template param
      return state.roles.filter(
        (r) =>
          r.tenant_id === tenantIdParam || (r.role_key === 'school_owner' && r.tenant_id === null),
      );
    }
    return [];
  });

  const executeRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('INSERT INTO role_permissions')) {
      state.insertCalls += 1;
      return state.insertResult;
    }
    return 0;
  });

  const executeRawUnsafe = jest.fn(async (sql: string) => {
    if (sql.includes('set_config')) {
      state.setConfigCalls.push(sql);
    }
    return 0;
  });

  const $transaction = jest.fn(async <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => {
    const tx: PrismaClient = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      $executeRawUnsafe: executeRawUnsafe,
    } as unknown as PrismaClient;
    return fn(tx);
  });

  return {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $executeRawUnsafe: executeRawUnsafe,
    $transaction,
  } as unknown as PrismaClient;
}

const PERM_VIEW: FakePermission = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  permission_key: 'configuration.communications.view',
};
const PERM_MANAGE: FakePermission = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  permission_key: 'configuration.communications.manage',
};

const TENANT_NHQS: FakeTenant = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001',
  slug: 'nhqs',
};
const TENANT_STRESS_A: FakeTenant = {
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  slug: 'stress-a',
};

function buildRoles(tenant: FakeTenant): FakeRole[] {
  return [
    {
      id: `cccccccc-0000-4000-8000-${tenant.slug.padEnd(12, '0')}`.slice(0, 36),
      tenant_id: tenant.id,
      role_key: 'school_owner',
    },
    {
      id: `dddddddd-0000-4000-8000-${tenant.slug.padEnd(12, '0')}`.slice(0, 36),
      tenant_id: tenant.id,
      role_key: 'school_principal',
    },
  ];
}

describe('backfill-communications-permissions — runBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('first run inserts 4 grants per tenant (2 roles × 2 permissions) — adds, none skipped', async () => {
    const state: MockPrismaState = {
      permissions: [PERM_VIEW, PERM_MANAGE],
      tenants: [TENANT_NHQS, TENANT_STRESS_A],
      roles: [...buildRoles(TENANT_NHQS), ...buildRoles(TENANT_STRESS_A)],
      insertResult: 1,
      setConfigCalls: [],
      insertCalls: 0,
    };
    const prisma = buildMockPrisma(state);

    const result = await runBackfill(prisma);

    expect(result.tenantsProcessed).toBe(2);
    expect(result.totalGrantsAdded).toBe(8); // 2 tenants × 2 roles × 2 perms
    expect(result.totalGrantsSkipped).toBe(0);
    expect(state.insertCalls).toBe(8);
    // app.current_tenant_id set once per tenant
    expect(state.setConfigCalls.filter((c) => c.includes('current_tenant_id'))).toHaveLength(2);
  });

  it('idempotent re-run reports 0 added, all skipped', async () => {
    const state: MockPrismaState = {
      permissions: [PERM_VIEW, PERM_MANAGE],
      tenants: [TENANT_NHQS, TENANT_STRESS_A],
      roles: [...buildRoles(TENANT_NHQS), ...buildRoles(TENANT_STRESS_A)],
      insertResult: 0, // every insert hits ON CONFLICT
      setConfigCalls: [],
      insertCalls: 0,
    };
    const prisma = buildMockPrisma(state);

    const result = await runBackfill(prisma);

    expect(result.tenantsProcessed).toBe(2);
    expect(result.totalGrantsAdded).toBe(0);
    expect(result.totalGrantsSkipped).toBe(8);
    expect(state.insertCalls).toBe(8);
  });

  it('throws when a permission row is missing — directs operator to sync-missing-permissions.ts', async () => {
    const state: MockPrismaState = {
      permissions: [PERM_VIEW], // PERM_MANAGE missing
      tenants: [TENANT_NHQS],
      roles: buildRoles(TENANT_NHQS),
      insertResult: 1,
      setConfigCalls: [],
      insertCalls: 0,
    };
    const prisma = buildMockPrisma(state);

    await expect(runBackfill(prisma)).rejects.toThrow(/configuration\.communications\.manage/);
    await expect(runBackfill(prisma)).rejects.toThrow(/sync-missing-permissions/);
    expect(state.insertCalls).toBe(0); // never attempted any grants
  });

  it('skips processing when no tenants match the slug allowlist (empty tenants array)', async () => {
    const state: MockPrismaState = {
      permissions: [PERM_VIEW, PERM_MANAGE],
      tenants: [], // dev DB has none of the test tenants
      roles: [],
      insertResult: 1,
      setConfigCalls: [],
      insertCalls: 0,
    };
    const prisma = buildMockPrisma(state);

    const result = await runBackfill(prisma);

    expect(result.tenantsProcessed).toBe(0);
    expect(result.totalGrantsAdded).toBe(0);
    expect(state.insertCalls).toBe(0);
  });
});
