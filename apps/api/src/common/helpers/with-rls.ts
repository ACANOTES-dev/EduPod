import type { PrismaClient } from '@prisma/client';

import { createRlsClient } from '../middleware/rls.middleware';

/**
 * Execute a callback within an RLS-scoped transaction.
 *
 * Encapsulates the createRlsClient + $transaction boilerplate and the one
 * permitted `as unknown as PrismaClient` cast (CLAUDE.md exception).
 *
 * Every service that needs tenant-scoped writes should use this instead of
 * calling createRlsClient().$transaction() manually.
 */
export async function withRls<T>(
  prisma: PrismaClient,
  context: { tenant_id: string; user_id?: string },
  fn: (tx: PrismaClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  const rlsClient = createRlsClient(prisma, context);
  return rlsClient.$transaction(async (tx) => {
    // This is the ONE permitted `as unknown as PrismaClient` cast.
    // It is safe because the RLS middleware wraps an interactive transaction
    // whose inner client exposes the full Prisma query surface.
    return fn(tx as unknown as PrismaClient);
  }, options) as Promise<T>;
}
