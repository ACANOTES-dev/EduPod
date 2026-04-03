import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

export const SCHEDULING_REAP_STALE_JOB = 'scheduling:reap-stale-runs';

@Processor(QUEUE_NAMES.SCHEDULING, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SchedulingStaleReaperProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulingStaleReaperProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULING_REAP_STALE_JOB) return;

    this.logger.log('Reaping stale scheduling runs...');

    // Find all runs stuck in 'running' status — system-level query (no RLS)
    const staleRuns = await this.prisma.schedulingRun.findMany({
      where: { status: 'running' },
      select: { id: true, tenant_id: true, updated_at: true, config_snapshot: true },
    });

    const now = Date.now();
    let reaped = 0;

    // Group stale runs by tenant_id so we can set RLS context per tenant
    const staleByTenant = new Map<string, typeof staleRuns>();
    for (const run of staleRuns) {
      const config = run.config_snapshot as Record<string, unknown> | null;
      const settings = config?.settings as Record<string, number> | undefined;
      const maxDuration = (settings?.max_solver_duration_seconds ?? 120) * 2 * 1000; // 2x max duration in ms
      const staleSince = now - run.updated_at.getTime();

      if (staleSince > maxDuration) {
        if (!staleByTenant.has(run.tenant_id)) {
          staleByTenant.set(run.tenant_id, []);
        }
        staleByTenant.get(run.tenant_id)!.push(run);
      }
    }

    // Process each tenant's stale runs with RLS context
    for (const [tenantId, runs] of staleByTenant.entries()) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Set RLS context for this tenant
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

        for (const run of runs) {
          await tx.schedulingRun.update({
            where: { id: run.id },
            data: {
              status: 'failed',
              failure_reason: 'Stale run reaped — worker likely crashed',
            },
          });
          reaped++;
          this.logger.warn(
            `Reaped stale run ${run.id} (tenant: ${tenantId}, stale for ${Math.round((now - run.updated_at.getTime()) / 1000)}s)`,
          );
        }
      });
    }

    this.logger.log(`Stale run reaper complete: ${reaped} runs reaped`);
  }
}
