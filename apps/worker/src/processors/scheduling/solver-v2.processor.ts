import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';
import { solveV2 } from '../../../../../packages/shared/src/scheduler';
import type { SolverInputV2 } from '../../../../../packages/shared/src/scheduler';

export interface SchedulingSolverV2Payload extends TenantJobPayload {
  tenant_id: string;
  run_id: string;
}

export const SCHEDULING_SOLVE_V2_JOB = 'scheduling:solve-v2';

@Processor(QUEUE_NAMES.SCHEDULING)
export class SchedulingSolverV2Processor extends WorkerHost {
  private readonly logger = new Logger(SchedulingSolverV2Processor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SchedulingSolverV2Payload>): Promise<void> {
    if (job.name !== SCHEDULING_SOLVE_V2_JOB) return;

    this.logger.log(`Processing ${SCHEDULING_SOLVE_V2_JOB} -- run ${job.data.run_id}`);

    const solverJob = new SchedulingSolverV2Job(this.prisma);
    try {
      await solverJob.execute(job.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown solver v2 error';
      this.logger.error(`Solver v2 failed for run ${job.data.run_id}: ${message}`);
      try {
        await this.prisma.schedulingRun.update({
          where: { id: job.data.run_id },
          data: { status: 'failed', failure_reason: message },
        });
      } catch (updateErr) {
        this.logger.error(`Failed to mark run ${job.data.run_id} as failed: ${updateErr}`);
      }
      throw err;
    }
  }
}

class SchedulingSolverV2Job extends TenantAwareJob<SchedulingSolverV2Payload> {
  private readonly logger = new Logger(SchedulingSolverV2Job.name);

  protected async processJob(
    data: SchedulingSolverV2Payload,
    tx: PrismaClient,
  ): Promise<void> {
    const { run_id } = data;

    // 1. Load the run
    const run = await tx.schedulingRun.findFirst({
      where: { id: run_id },
    });

    if (!run || run.status !== 'queued') {
      this.logger.warn(`Run ${run_id} not found or not in queued status, skipping`);
      return;
    }

    // 2. Update status to running
    await tx.schedulingRun.update({
      where: { id: run_id },
      data: { status: 'running' },
    });

    // 3. Load solver input from config_snapshot
    const configSnapshot = run.config_snapshot as unknown as SolverInputV2 | null;

    if (!configSnapshot) {
      throw new Error('No config_snapshot found on scheduling run');
    }

    // Apply solver seed from run if set
    if (run.solver_seed !== null) {
      configSnapshot.settings.solver_seed = Number(run.solver_seed);
    }

    this.logger.log(
      `Starting solver v2 for run ${run_id}: ${configSnapshot.year_groups.length} year groups, ${configSnapshot.curriculum.length} curriculum entries, ${configSnapshot.teachers.length} teachers`,
    );

    // 4. Run solver
    const result = solveV2(configSnapshot, {
      onProgress: (assigned, total, phase) => {
        this.logger.debug(`Solver v2 progress: ${assigned}/${total} (${phase})`);
      },
    });

    // 5. Save results
    const resultJson = {
      entries: result.entries,
      unassigned: result.unassigned,
    };

    await tx.schedulingRun.update({
      where: { id: run_id },
      data: {
        status: 'completed',
        result_json: JSON.parse(JSON.stringify(resultJson)),
        hard_constraint_violations: result.constraint_summary.tier1_violations,
        soft_preference_score: result.score,
        soft_preference_max: result.max_score,
        entries_generated: result.entries.filter((e) => !e.is_pinned).length,
        entries_pinned: result.entries.filter((e) => e.is_pinned).length,
        entries_unassigned: result.unassigned.length,
        solver_duration_ms: result.duration_ms,
        solver_seed: configSnapshot.settings.solver_seed !== null
          ? BigInt(configSnapshot.settings.solver_seed)
          : BigInt(0),
      },
    });

    this.logger.log(
      `Solver v2 completed for run ${run_id}: ${result.entries.length} entries, ${result.unassigned.length} unassigned, score ${result.score}/${result.max_score} in ${result.duration_ms}ms`,
    );
  }
}
