import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
}

// ─── Base class ───────────────────────────────────────────────────────────────

/**
 * Abstract base class for system-wide (cross-tenant) BullMQ job processors.
 *
 * INTENTIONALLY does NOT set RLS context. These jobs operate across all
 * tenants simultaneously (e.g. materialized view refresh, IP cleanup, breach
 * monitoring). Setting a single tenant's RLS context here would be incorrect.
 *
 * Responsibilities:
 * - Makes the cross-tenant intent explicit and auditable at the class boundary
 * - Logs a system-wide operation marker so it's visible in logs
 * - Provides a `forEachTenant()` helper for jobs that iterate all active tenants
 *
 * Subclasses must implement `runSystemJob()`.
 *
 * @example
 * class MyCleanupJob extends CrossTenantSystemJob {
 *   protected async runSystemJob(): Promise<void> {
 *     await this.forEachTenant(async (tenantId) => {
 *       await this.cleanupForTenant(tenantId);
 *     });
 *   }
 * }
 */
export abstract class CrossTenantSystemJob {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaClient,
    jobName: string,
  ) {
    this.logger = new Logger(jobName);
  }

  /**
   * Entry point for all cross-tenant system jobs.
   * Logs a clearly identifiable system-wide marker before delegating to
   * `runSystemJob()`.
   */
  async execute(): Promise<void> {
    this.logger.log('[SYSTEM-WIDE JOB] Starting — no RLS context (cross-tenant operation)');
    await this.runSystemJob();
    this.logger.log('[SYSTEM-WIDE JOB] Complete');
  }

  /**
   * Subclasses implement their cross-tenant logic here.
   */
  protected abstract runSystemJob(): Promise<void>;

  /**
   * Fetches all active tenants and calls `callback` for each one in sequence.
   * Errors from individual tenants are caught and logged — one failing tenant
   * never aborts processing of the rest.
   *
   * @param callback  Async function invoked once per active tenant.
   */
  protected async forEachTenant(
    callback: (tenantId: string) => Promise<void>,
  ): Promise<{ processed: number; failed: number }> {
    const tenants: TenantRow[] = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let processed = 0;
    let failed = 0;

    for (const tenant of tenants) {
      try {
        await callback(tenant.id);
        processed++;
      } catch (error) {
        failed++;
        this.logger.error(
          `[SYSTEM-WIDE JOB] Failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `[SYSTEM-WIDE JOB] forEachTenant complete — processed: ${processed}, failed: ${failed}, total: ${tenants.length}`,
    );

    return { processed, failed };
  }
}
