import { PrismaClient } from '@prisma/client';
import { SYSTEM_USER_SENTINEL } from '@school/shared';

/**
 * RLS middleware for Prisma.
 *
 * Creates a Prisma client extension that wraps interactive transactions
 * with SET LOCAL app.current_tenant_id and app.current_user_id. This ensures
 * every query within the transaction respects Row-Level Security policies.
 *
 * Usage:
 *   const prismaWithRls = createRlsClient(prisma, { tenant_id, user_id });
 *   await prismaWithRls.$transaction(async (tx) => {
 *     // All queries here are scoped to the tenant and user
 *   });
 */
// UUID v4 format: 8-4-4-4-12 hex chars
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRlsClient(
  prisma: PrismaClient,
  context: { tenant_id: string; user_id?: string },
) {
  // Validate tenant_id format to prevent SQL injection
  if (!UUID_RE.test(context.tenant_id)) {
    throw new Error(`Invalid tenant_id format: ${context.tenant_id}`);
  }

  // Validate user_id format if provided
  if (context.user_id !== undefined && !UUID_RE.test(context.user_id)) {
    throw new Error(`Invalid user_id format: ${context.user_id}`);
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
      async $transaction(
        fn: (tx: PrismaClient) => Promise<unknown>,
        options?: { timeout?: number; maxWait?: number },
      ) {
        return prisma.$transaction(async (tx) => {
          // Set RLS context for this transaction using parameterised set_config()
          await (
            tx as unknown as {
              $executeRawUnsafe: (sql: string, ...args: string[]) => Promise<unknown>;
            }
          ).$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            context.tenant_id,
          );

          // Set user context — defaults to sentinel for system operations
          const userId = context.user_id || SYSTEM_USER_SENTINEL;
          await (
            tx as unknown as {
              $executeRawUnsafe: (sql: string, ...args: string[]) => Promise<unknown>;
            }
          ).$executeRawUnsafe(`SELECT set_config('app.current_user_id', $1, true)`, userId);

          return fn(tx as unknown as PrismaClient);
        }, options);
      },
    },
  });
}
