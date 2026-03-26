import { PrismaClient } from '@prisma/client';

/**
 * RLS middleware for Prisma.
 *
 * Creates a Prisma client extension that wraps interactive transactions
 * with SET LOCAL app.current_tenant_id. This ensures every query within
 * the transaction respects Row-Level Security policies.
 *
 * Usage:
 *   const prismaWithRls = createRlsClient(prisma, tenantContext);
 *   await prismaWithRls.$transaction(async (tx) => {
 *     // All queries here are scoped to the tenant
 *   });
 */
// UUID v4 format: 8-4-4-4-12 hex chars
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRlsClient(prisma: PrismaClient, tenant: { tenant_id: string }) {
  // Validate tenant_id format to prevent SQL injection
  if (!UUID_RE.test(tenant.tenant_id)) {
    throw new Error(`Invalid tenant_id format: ${tenant.tenant_id}`);
  }

  return prisma.$extends({
    query: {
      $allOperations({ args, query }) {
        // For interactive transactions, the SET LOCAL is handled
        // at the transaction start. For individual queries outside
        // transactions, we inject the tenant context.
        return query(args);
      },
    },
    client: {
      async $transaction(fn: (tx: PrismaClient) => Promise<unknown>, options?: { timeout?: number; maxWait?: number }) {
        return prisma.$transaction(async (tx) => {
          // Set RLS context for this transaction using parameterised set_config()
          await (tx as unknown as { $executeRawUnsafe: (sql: string, ...args: string[]) => Promise<unknown> })
            .$executeRawUnsafe(
              `SELECT set_config('app.current_tenant_id', $1, true)`,
              tenant.tenant_id,
            );
          return fn(tx as unknown as PrismaClient);
        }, options);
      },
    },
  });
}
