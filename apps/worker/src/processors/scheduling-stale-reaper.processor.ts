import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

export const SCHEDULING_REAP_STALE_JOB = 'scheduling:reap-stale-runs';

// Stage 8: this used to be `@Processor(QUEUE_NAMES.SCHEDULING)` alongside the
// solver-v2 processor. BullMQ then spawned two competing Worker instances on
// the same queue, and whichever pulled a `solve-v2` job first would silently
// no-op (its early-return marked the BullMQ job complete without running the
// solver). We collapsed both processors into a single @Processor on the
// solver-v2 file; this class is now a plain service called by that processor
// when a `scheduling:reap-stale-runs` job lands.

// SCHED-029 (STRESS-081): the reaper gained two additional responsibilities.
// (1) `reapOnStartup()` runs once when the worker boots — it fails any run
//     stuck in 'queued' or 'running' that is older than a short grace window,
//     because on startup no worker is actively solving so any such row is
//     leftover from a prior process that crashed mid-solve. Before this hook,
//     a worker crash left the DB row in 'running' forever, blocking the
//     tenant via `RUN_ALREADY_ACTIVE` on every future trigger.
// (2) The cron-driven `process()` path uses a tighter threshold
//     (`max_solver_duration_seconds + 60s` rather than `* 2`) so an admin-
//     observable ceiling of max-duration + ~2 minutes holds instead of
//     max-duration * 2 + checker cadence.
//
// `scheduling_runs` has FORCE ROW LEVEL SECURITY, so every query must run
// inside a transaction with `app.current_tenant_id` set. We iterate over the
// `tenants` table (no RLS) and run a per-tenant find-and-update inside its
// own RLS context — mirroring the CrossTenantSystemJob pattern used by the
// other cross-tenant workers.

const STARTUP_REAPER_GRACE_MS = 30_000;
const CRON_REAPER_BUFFER_MS = 60_000;
const DEFAULT_MAX_SOLVER_DURATION_SECONDS = 120;

interface StaleRunRow {
  id: string;
  status: 'queued' | 'running';
  updated_at: Date;
  config_snapshot: unknown;
}

@Injectable()
export class SchedulingStaleReaperJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulingStaleReaperJob.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap(): Promise<void> {
    // Fire-and-log: a reaper failure must not block worker startup.
    try {
      await this.reapOnStartup();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown startup reaper error';
      this.logger.error(`Startup reaper failed: ${message}`);
    }
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULING_REAP_STALE_JOB) return;
    await this.reapStaleRuns();
  }

  /**
   * Fail any scheduling run stuck in 'queued' or 'running' whose
   * `updated_at` is older than the startup grace window. Safe to call on
   * worker boot: no process is solving yet, so any such row belongs to a
   * predecessor that died.
   */
  async reapOnStartup(): Promise<number> {
    this.logger.log('Startup reaper: scanning for runs left stuck by a prior worker...');

    const threshold = new Date(Date.now() - STARTUP_REAPER_GRACE_MS);
    const tenantIds = await this.loadActiveTenantIds();

    let reaped = 0;
    for (const tenantId of tenantIds) {
      try {
        reaped += await this.reapStartupForTenant(tenantId, threshold);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Startup reaper failed for tenant ${tenantId}: ${message}`);
      }
    }

    this.logger.log(`Startup reaper complete: ${reaped} run(s) reaped.`);
    return reaped;
  }

  /**
   * Cron-driven reaper. Fails 'running' runs whose `updated_at` is older
   * than their configured `max_solver_duration_seconds` + buffer.
   */
  async reapStaleRuns(): Promise<number> {
    this.logger.log('Reaping stale scheduling runs...');

    const tenantIds = await this.loadActiveTenantIds();
    let reaped = 0;
    for (const tenantId of tenantIds) {
      try {
        reaped += await this.reapStaleForTenant(tenantId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Cron reaper failed for tenant ${tenantId}: ${message}`);
      }
    }

    this.logger.log(`Stale run reaper complete: ${reaped} runs reaped`);
    return reaped;
  }

  private async loadActiveTenantIds(): Promise<string[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }

  private async reapStartupForTenant(tenantId: string, threshold: Date): Promise<number> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

      const stuck = (await tx.schedulingRun.findMany({
        where: {
          status: { in: ['queued', 'running'] },
          updated_at: { lt: threshold },
        },
        select: { id: true, status: true, updated_at: true, config_snapshot: true },
      })) as StaleRunRow[];

      for (const run of stuck) {
        await tx.schedulingRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            failure_reason:
              'Worker crashed or restarted mid-run — reaped on worker startup (SCHED-029)',
          },
        });
        this.logger.warn(
          `Startup reaper: reaped run ${run.id} (tenant ${tenantId}, prior status ${run.status}, age ${Math.round((Date.now() - run.updated_at.getTime()) / 1000)}s)`,
        );
      }

      return stuck.length;
    });
  }

  private async reapStaleForTenant(tenantId: string): Promise<number> {
    const now = Date.now();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

      const candidates = (await tx.schedulingRun.findMany({
        where: { status: 'running' },
        select: { id: true, status: true, updated_at: true, config_snapshot: true },
      })) as StaleRunRow[];

      let reaped = 0;
      for (const run of candidates) {
        const config = run.config_snapshot as Record<string, unknown> | null;
        const settings = config?.settings as Record<string, number> | undefined;
        const maxDurationMs =
          (settings?.max_solver_duration_seconds ?? DEFAULT_MAX_SOLVER_DURATION_SECONDS) * 1000;
        const threshold = maxDurationMs + CRON_REAPER_BUFFER_MS;
        const staleSince = now - run.updated_at.getTime();
        if (staleSince <= threshold) continue;

        await tx.schedulingRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            failure_reason: 'Stale run reaped — worker likely crashed',
          },
        });
        reaped++;
        this.logger.warn(
          `Reaped stale run ${run.id} (tenant: ${tenantId}, stale for ${Math.round(staleSince / 1000)}s)`,
        );
      }

      return reaped;
    });
  }
}
