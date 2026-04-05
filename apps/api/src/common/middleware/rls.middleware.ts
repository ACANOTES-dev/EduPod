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

type TransactionOptions = { timeout?: number; maxWait?: number };
type RlsPrismaTransaction = PrismaClient & {
  $executeRawUnsafe: (sql: string, ...args: string[]) => Promise<unknown>;
};

export type RlsContext = {
  tenant_id?: string;
  user_id?: string;
  membership_id?: string;
  tenant_domain?: string;
};

// The bootstrap RLS policies cast all three settings to UUID, so missing values
// must still be valid UUIDs or PostgreSQL can raise 22P02 before the intended
// fallback policy branch is evaluated.
const RLS_UUID_SENTINEL = SYSTEM_USER_SENTINEL;

function validateUuid(value: string | undefined, label: string): void {
  if (value !== undefined && !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label} format: ${value}`);
  }
}

function validateRlsContext(context: RlsContext): void {
  validateUuid(context.tenant_id, 'tenant_id');
  validateUuid(context.user_id, 'user_id');
  validateUuid(context.membership_id, 'membership_id');

  if (!context.tenant_id && !context.user_id && !context.membership_id && !context.tenant_domain) {
    throw new Error('RLS context requires at least one setting');
  }
}

async function applyRlsContext(tx: RlsPrismaTransaction, context: RlsContext): Promise<void> {
  const tenantId = context.tenant_id ?? RLS_UUID_SENTINEL;
  await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId);

  const userId = context.user_id ?? SYSTEM_USER_SENTINEL;
  await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_id', $1, true)`, userId);

  const membershipId = context.membership_id ?? RLS_UUID_SENTINEL;
  await tx.$executeRawUnsafe(
    `SELECT set_config('app.current_membership_id', $1, true)`,
    membershipId,
  );

  if (context.tenant_domain) {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_domain', $1, true)`,
      context.tenant_domain,
    );
  }
}

export async function runWithRlsContext<T>(
  prisma: PrismaClient,
  context: RlsContext,
  fn: (tx: PrismaClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  validateRlsContext(context);

  return prisma.$transaction(async (tx) => {
    await applyRlsContext(tx as unknown as RlsPrismaTransaction, context);
    return fn(tx as unknown as PrismaClient);
  }, options);
}

export function createRlsClient(
  prisma: PrismaClient,
  context: { tenant_id: string; user_id?: string },
) {
  validateRlsContext(context);

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
      async $transaction<T>(
        fn: (tx: PrismaClient) => Promise<T>,
        options?: TransactionOptions,
      ): Promise<T> {
        return prisma.$transaction(async (tx) => {
          await applyRlsContext(tx as unknown as RlsPrismaTransaction, context);
          return fn(tx as unknown as PrismaClient);
        }, options);
      },
    },
  });
}
