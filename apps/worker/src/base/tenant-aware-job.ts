import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Sentinel UUID for system-initiated operations (cron jobs, workers) where no human user is acting.
 * This value never matches any cp_access_grants row, ensuring system jobs cannot access CP records.
 */
export const SYSTEM_USER_SENTINEL = '00000000-0000-0000-0000-000000000000';

/**
 * Abstract base class for tenant-aware BullMQ job processors.
 *
 * Every job payload MUST include tenant_id. This base class:
 * 1. Validates tenant_id is present
 * 2. Wraps execution in an interactive Prisma transaction
 * 3. Sets RLS context (SET LOCAL app.current_tenant_id) before any DB operation
 * 4. Sets user context (SET LOCAL app.current_user_id) — defaults to sentinel for system jobs
 * 5. Logs correlation_id when present for cross-service tracing
 *
 * Subclasses implement `processJob()` which receives the tenant-scoped
 * Prisma transaction client.
 */
export interface TenantJobPayload {
  tenant_id: string;
  user_id?: string;
  /** HTTP request correlation ID — propagated from the API for cross-service tracing */
  correlation_id?: string;
  [key: string]: unknown;
}

export abstract class TenantAwareJob<T extends TenantJobPayload> {
  private static readonly logger = new Logger(TenantAwareJob.name);

  constructor(protected prisma: PrismaClient) {}

  // UUID v4 format
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Interactive transaction timeout (ms). Default is 5 minutes — matches the
   * longest BullMQ `lockDuration` we use on any queue (gradebook) and gives
   * heavy jobs (report-card render loops, mass PDF jobs, bulk imports) room
   * to finish without Prisma's 5s default aborting them mid-flight.
   *
   * Subclasses can override by passing a different value to `super()` via
   * the `transactionTimeoutMs` protected field if they need more (or less).
   */
  protected readonly transactionTimeoutMs: number = 5 * 60_000;

  async execute(data: T): Promise<void> {
    if (!data.tenant_id) {
      throw new Error(
        `Job rejected: missing tenant_id in payload. All jobs must include tenant_id.`,
      );
    }

    if (!TenantAwareJob.UUID_RE.test(data.tenant_id)) {
      throw new Error(`Job rejected: invalid tenant_id format "${data.tenant_id}".`);
    }

    if (data.user_id && !TenantAwareJob.UUID_RE.test(data.user_id)) {
      throw new Error(`Job rejected: invalid user_id format "${data.user_id}".`);
    }

    // Log correlation ID when present for cross-service tracing
    if (data.correlation_id) {
      TenantAwareJob.logger.log(
        `Processing job — tenant=${data.tenant_id} correlationId=${data.correlation_id}`,
      );
    }

    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Set RLS context for this transaction using safe tagged template literal
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${data.tenant_id}::text, true)`;

        // Set user context — defaults to sentinel for system operations
        const userId = data.user_id || SYSTEM_USER_SENTINEL;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;

        await this.processJob(data, tx as unknown as PrismaClient);
      },
      {
        // `maxWait` is how long Prisma waits to acquire a transaction slot
        // from the pool; `timeout` is the max in-transaction runtime. Both
        // default to 2s / 5s in Prisma which is far too short for the heavy
        // workers that render PDFs or iterate many rows inside the tx.
        maxWait: 30_000,
        timeout: this.transactionTimeoutMs,
      },
    );
  }

  protected abstract processJob(data: T, tx: PrismaClient): Promise<void>;
}
