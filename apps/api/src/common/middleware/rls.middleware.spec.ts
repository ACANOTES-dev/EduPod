import { PrismaClient } from '@prisma/client';
import type { TenantContext } from '@school/shared';

import { createRlsClient } from './rls.middleware';

describe('RLS Middleware', () => {
  it('should return extended Prisma client', () => {
    const mockPrisma = {
      $extends: jest.fn().mockReturnValue({ extended: true }),
    } as unknown as PrismaClient;

    const tenant: TenantContext = {
      tenant_id: '11111111-1111-1111-1111-111111111111',
      slug: 'test-school',
      name: 'Test School',
      status: 'active',
      default_locale: 'en',
      timezone: 'UTC',
    };

    const result = createRlsClient(mockPrisma, tenant);
    expect(result).toBeDefined();
    expect(mockPrisma.$extends).toHaveBeenCalled();
  });

  it('should set tenant context in transaction', async () => {
    const mockTx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    // Create a mock PrismaClient that captures the $extends config
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

    const tenant: TenantContext = {
      tenant_id: '22222222-2222-2222-2222-222222222222',
      slug: 'test-school',
      name: 'Test School',
      status: 'active',
      default_locale: 'en',
      timezone: 'UTC',
    };

    createRlsClient(mockPrisma, tenant);

    // Verify the extension was created with the right structure
    expect(capturedExtension).toBeDefined();
    expect(capturedExtension).toHaveProperty('client');

    // Call the custom $transaction method to verify SET LOCAL is issued
    const client = capturedExtension!['client'] as { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    await client.$transaction(async (_tx: unknown) => {
      // Just verify the transaction runs
    });

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      '22222222-2222-2222-2222-222222222222',
    );
  });
});
