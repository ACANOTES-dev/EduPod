import { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { createRlsClient, runWithRlsContext } from './rls.middleware';

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
    const client = capturedExtension!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
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

    const client = capturedExtension!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
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

    const client = capturedExtension!['client'] as {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    };
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

    expect(() => createRlsClient(mockPrisma, { tenant_id: 'not-a-uuid' })).toThrow(
      'Invalid tenant_id format: not-a-uuid',
    );
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

  it('should set current_user_id without requiring tenant_id', async () => {
    const mockTx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    const mockPrisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    } as unknown as PrismaClient;

    await runWithRlsContext(
      mockPrisma,
      { user_id: '33333333-3333-3333-3333-333333333333' },
      async () => undefined,
    );

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_user_id', $1, true)`,
      '33333333-3333-3333-3333-333333333333',
    );
  });

  it('should set tenant_domain and membership_id when provided', async () => {
    const mockTx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    const mockPrisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    } as unknown as PrismaClient;

    await runWithRlsContext(
      mockPrisma,
      {
        membership_id: '44444444-4444-4444-4444-444444444444',
        tenant_domain: 'al-noor.edupod.app',
      },
      async () => undefined,
    );

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockTx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      `SELECT set_config('app.current_membership_id', $1, true)`,
      '44444444-4444-4444-4444-444444444444',
    );
    expect(mockTx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      `SELECT set_config('app.current_tenant_domain', $1, true)`,
      'al-noor.edupod.app',
    );
  });

  it('should reject empty RLS context', async () => {
    const mockPrisma = {
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    await expect(runWithRlsContext(mockPrisma, {}, async () => undefined)).rejects.toThrow(
      'RLS context requires at least one setting',
    );
  });

  it('should reject invalid membership_id format', async () => {
    const mockPrisma = {
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    await expect(
      runWithRlsContext(mockPrisma, { membership_id: 'not-a-uuid' }, async () => undefined),
    ).rejects.toThrow('Invalid membership_id format: not-a-uuid');
  });
});
