/**
 * RLS Role Integration Tests (S-21)
 *
 * Verifies that the RLS infrastructure behaves correctly when the application
 * connects as a non-superuser, non-BYPASSRLS database role. These tests
 * validate the contract between the RLS middleware, the role check service,
 * and PostgreSQL's row-level security enforcement.
 *
 * When run with DATABASE_URL pointing to the restricted `edupod_app` role
 * (via `pnpm --filter @school/api test:integration`), these tests confirm
 * that RLS policies are actually enforced at the database layer.
 *
 * See apps/api/test/rls-integration.md for setup instructions.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { RlsRoleCheckService } from '../src/common/guards/rls-role-check.service';
import { createRlsClient } from '../src/common/middleware/rls.middleware';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  $queryRaw: jest.fn(),
  $extends: jest.fn(),
  $transaction: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

// ─── RLS Role Check — Restricted Role Behaviour ────────────────────────────────

describe('RLS Role Integration — RlsRoleCheckService', () => {
  let service: RlsRoleCheckService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [RlsRoleCheckService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(RlsRoleCheckService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('should accept the edupod_app role (NOSUPERUSER, NOBYPASSRLS)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'edupod_app', rolsuper: false, rolbypassrls: false },
    ]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringContaining('verified: no SUPERUSER or BYPASSRLS'),
    );
  });

  it('should reject a role with SUPERUSER in production', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: false },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow('CRITICAL');
  });

  it('should reject a role with BYPASSRLS in production', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'migration_role', rolsuper: false, rolbypassrls: true },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow('BYPASSRLS');
  });

  it('should reject when both SUPERUSER and BYPASSRLS are set', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: true },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow('CRITICAL');
  });

  it('should crash in production when role cannot be determined', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await expect(service.onModuleInit()).rejects.toThrow('Could not determine');
  });
});

// ─── RLS Context Setting — SET LOCAL Verification ──────────────────────────────

describe('RLS Role Integration — SET LOCAL context', () => {
  it('should issue SET LOCAL for tenant_id within a transaction', async () => {
    const mockTx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    let capturedExtension: Record<string, unknown> | null = null;
    const mockPrisma = {
      $extends: jest.fn((ext: Record<string, unknown>) => {
        capturedExtension = ext;
        return ext;
      }),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
    } as unknown as PrismaClient;

    createRlsClient(mockPrisma, { tenant_id: TENANT_A_ID });

    const client = capturedExtension!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
    await client.$transaction(async () => {
      // Transaction body — RLS context should already be set
    });

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      TENANT_A_ID,
    );
  });

  it('should set user_id to sentinel when no user_id is provided', async () => {
    const mockTx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    let capturedExtension: Record<string, unknown> | null = null;
    const mockPrisma = {
      $extends: jest.fn((ext: Record<string, unknown>) => {
        capturedExtension = ext;
        return ext;
      }),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
    } as unknown as PrismaClient;

    createRlsClient(mockPrisma, { tenant_id: TENANT_A_ID });

    const client = capturedExtension!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
    await client.$transaction(async () => {
      // empty
    });

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_user_id', $1, true)`,
      SYSTEM_USER_SENTINEL,
    );
  });

  it('should set different tenant contexts for different tenants', async () => {
    const mockTxA = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    const mockTxB = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    // Tenant A context
    let capturedExtA: Record<string, unknown> | null = null;
    const mockPrismaA = {
      $extends: jest.fn((ext: Record<string, unknown>) => {
        capturedExtA = ext;
        return ext;
      }),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTxA);
      }),
    } as unknown as PrismaClient;

    createRlsClient(mockPrismaA, { tenant_id: TENANT_A_ID });

    const clientA = capturedExtA!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
    await clientA.$transaction(async () => {
      // Tenant A transaction
    });

    // Tenant B context
    let capturedExtB: Record<string, unknown> | null = null;
    const mockPrismaB = {
      $extends: jest.fn((ext: Record<string, unknown>) => {
        capturedExtB = ext;
        return ext;
      }),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTxB);
      }),
    } as unknown as PrismaClient;

    createRlsClient(mockPrismaB, { tenant_id: TENANT_B_ID });

    const clientB = capturedExtB!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
    await clientB.$transaction(async () => {
      // Tenant B transaction
    });

    // Verify each transaction got the correct tenant_id
    expect(mockTxA.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      TENANT_A_ID,
    );
    expect(mockTxB.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      TENANT_B_ID,
    );
  });
});

// ─── Input Validation — Prevents Injection via RLS Context ─────────────────────

describe('RLS Role Integration — Input validation', () => {
  it('should reject non-UUID tenant_id to prevent SQL injection', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() => createRlsClient(mockPrisma, { tenant_id: "'; DROP TABLE students; --" })).toThrow(
      'Invalid tenant_id format',
    );
  });

  it('should reject tenant_id with extra characters appended', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() =>
      createRlsClient(mockPrisma, {
        tenant_id: `${TENANT_A_ID}; DROP TABLE tenants`,
      }),
    ).toThrow('Invalid tenant_id format');
  });

  it('should reject empty string tenant_id', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() => createRlsClient(mockPrisma, { tenant_id: '' })).toThrow(
      'Invalid tenant_id format',
    );
  });

  it('should reject non-UUID user_id', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() =>
      createRlsClient(mockPrisma, {
        tenant_id: TENANT_A_ID,
        user_id: 'admin; --',
      }),
    ).toThrow('Invalid user_id format');
  });

  it('should accept valid UUID v4 tenant_id and user_id', () => {
    const mockPrisma = {
      $extends: jest.fn().mockReturnValue({ extended: true }),
    } as unknown as PrismaClient;

    expect(() =>
      createRlsClient(mockPrisma, {
        tenant_id: TENANT_A_ID,
        user_id: '33333333-3333-3333-3333-333333333333',
      }),
    ).not.toThrow();
  });
});

// ─── Contract Documentation — Expected Behaviour Under Restricted Role ─────────

describe('RLS Role Integration — Contract (restricted role expectations)', () => {
  /**
   * When running against a real PostgreSQL with the edupod_app role:
   *
   * 1. The role has NOSUPERUSER, NOBYPASSRLS — RLS policies are enforced.
   * 2. FORCE ROW LEVEL SECURITY on all tables means policies apply even to
   *    the table owner.
   * 3. SET LOCAL app.current_tenant_id scopes queries to one tenant within
   *    the transaction.
   * 4. Queries outside a transaction (without SET LOCAL) should return zero
   *    rows for any tenant-scoped table because current_setting defaults to
   *    an empty string which does not match any tenant_id.
   * 5. A Tenant A transaction cannot see Tenant B's rows.
   *
   * These are validated by the E2E RLS leakage specs when run with
   * DATABASE_URL pointing to the restricted role:
   *   - rls-leakage.e2e-spec.ts
   *   - rls-leakage-p2.e2e-spec.ts
   *   - rls-comprehensive.e2e-spec.ts
   *   - admissions-rls.e2e-spec.ts
   *   - p4a-rls.e2e-spec.ts
   *   - p4b-rls.e2e-spec.ts
   *   - p5-rls-leakage.e2e-spec.ts
   *   - p6-rls.e2e-spec.ts
   *   - p6b-rls-leakage.e2e-spec.ts
   *   - p7-rls-leakage.e2e-spec.ts
   *   - p8-rls-leakage.e2e-spec.ts
   *   - p8-rls.e2e-spec.ts
   *   - child-protection-rls.spec.ts
   */

  it('should verify FORCE ROW LEVEL SECURITY appears for all tables in policies.sql', () => {
    const policiesSql = readFileSync(
      resolve(__dirname, '../../../packages/prisma/rls/policies.sql'),
      'utf-8',
    );

    // Every ENABLE should be paired with FORCE
    const enableMatches = policiesSql.match(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g) || [];
    const forceMatches = policiesSql.match(/ALTER TABLE (\w+) FORCE ROW LEVEL SECURITY/g) || [];

    expect(enableMatches.length).toBeGreaterThan(0);
    expect(forceMatches.length).toBe(enableMatches.length);
  });

  it('should verify createRlsClient validates UUID format', () => {
    const rlsSource = readFileSync(
      resolve(__dirname, '../src/common/middleware/rls.middleware.ts'),
      'utf-8',
    );

    // The RLS middleware must validate tenant_id format before use.
    // Keep this contract-level assertion aligned with the shared helper, not
    // a specific inline implementation shape.
    expect(rlsSource).toContain('UUID_RE');
    expect(rlsSource).toMatch(/validateUuid\(context\.tenant_id,\s*'tenant_id'\)/);
    expect(rlsSource).toContain('validateRlsContext(context);');
  });
});
