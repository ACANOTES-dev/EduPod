import { PrismaClient } from '@prisma/client';
import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { createRlsClient } from './rls.middleware';

describe('RLS Middleware', () => {
  it('should return extended Prisma client', () => {
    const mockPrisma = {
      $extends: jest.fn().mockReturnValue({ extended: true }),
    } as unknown as PrismaClient;

    const context = {
      tenant_id: '11111111-1111-1111-1111-111111111111',
    };

    const result = createRlsClient(mockPrisma, context);
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

    const context = {
      tenant_id: '22222222-2222-2222-2222-222222222222',
    };

    createRlsClient(mockPrisma, context);

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

  it('should set app.current_user_id when user_id is provided', async () => {
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

    const context = {
      tenant_id: '22222222-2222-2222-2222-222222222222',
      user_id: '33333333-3333-3333-3333-333333333333',
    };

    createRlsClient(mockPrisma, context);

    const client = capturedExtension!['client'] as { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    await client.$transaction(async (_tx: unknown) => {
      // transaction body
    });

    // Should set tenant_id first, then user_id
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockTx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      '22222222-2222-2222-2222-222222222222',
    );
    expect(mockTx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      `SELECT set_config('app.current_user_id', $1, true)`,
      '33333333-3333-3333-3333-333333333333',
    );
  });

  it('should use sentinel when user_id is not provided', async () => {
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

    const context = {
      tenant_id: '22222222-2222-2222-2222-222222222222',
    };

    createRlsClient(mockPrisma, context);

    const client = capturedExtension!['client'] as { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    await client.$transaction(async (_tx: unknown) => {
      // transaction body
    });

    // Should set user_id to sentinel value
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockTx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      `SELECT set_config('app.current_user_id', $1, true)`,
      SYSTEM_USER_SENTINEL,
    );
  });

  it('should reject invalid tenant_id format', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() =>
      createRlsClient(mockPrisma, { tenant_id: 'not-a-uuid' }),
    ).toThrow('Invalid tenant_id format: not-a-uuid');
  });

  it('should reject invalid user_id format', () => {
    const mockPrisma = {
      $extends: jest.fn(),
    } as unknown as PrismaClient;

    expect(() =>
      createRlsClient(mockPrisma, {
        tenant_id: '22222222-2222-2222-2222-222222222222',
        user_id: 'not-a-uuid',
      }),
    ).toThrow('Invalid user_id format: not-a-uuid');
  });
});
