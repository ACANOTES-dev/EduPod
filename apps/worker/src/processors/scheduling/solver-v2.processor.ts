import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { solveV2 } from '../../../../../packages/shared/src/scheduler';
import type { SolverInputV2 } from '../../../../../packages/shared/src/scheduler';
import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';
import {
  SCHEDULING_REAP_STALE_JOB,
  SchedulingStaleReaperJob,
} from '../scheduling-stale-reaper.processor';

export interface SchedulingSolverV2Payload extends TenantJobPayload {
  tenant_id: string;
  run_id: string;
}

export const SCHEDULING_SOLVE_V2_JOB = 'scheduling:solve-v2';

@Processor(QUEUE_NAMES.SCHEDULING, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SchedulingSolverV2Processor extends WorkerHost {
  private readonly logger = new Logger(SchedulingSolverV2Processor.name);

  // Stage 8: this is the SOLE @Processor on the `scheduling` queue. We used
  // to have a second @Processor for the stale-reaper job, but that spawned a
  // competing BullMQ Worker instance that silently no-op'd whichever solve-v2
  // job it pulled first. The stale reaper now lives as a plain service that
  // we dispatch to here when a `scheduling:reap-stale-runs` job lands.
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly staleReaperJob: SchedulingStaleReaperJob,
  ) {
    super();
  }

  async process(job: Job<SchedulingSolverV2Payload>): Promise<void> {
    if (job.name === SCHEDULING_REAP_STALE_JOB) {
      await this.staleReaperJob.process(job as unknown as Job);
      return;
    }
    if (job.name !== SCHEDULING_SOLVE_V2_JOB) {
      this.logger.warn(`Unknown scheduling job name: ${job.name} (id ${job.id})`);
      return;
    }

    this.logger.log(`Processing ${SCHEDULING_SOLVE_V2_JOB} -- run ${job.data.run_id}`);

    const solverJob = new SchedulingSolverV2Job(this.prisma, job);
    try {
      await solverJob.execute(job.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown solver v2 error';
      this.logger.error(`Solver v2 failed for run ${job.data.run_id}: ${message}`);
      try {
        // RLS is enabled on scheduling_runs, so the update must run inside a
        // transaction with `app.current_tenant_id` set — otherwise the policy's
        // UUID cast of the empty setting fails with 22P02.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${job.data.tenant_id}::text, true)`;
          await tx.schedulingRun.update({
            where: { id: job.data.run_id },
            data: { status: 'failed', failure_reason: message },
          });
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

  constructor(
    prisma: PrismaClient,
    private readonly job: Job<SchedulingSolverV2Payload>,
  ) {
    super(prisma);
  }

  protected async processJob(data: SchedulingSolverV2Payload, _tx: PrismaClient): Promise<void> {
    const { run_id, tenant_id } = data;

    // SCHED-027 (Wave-2 follow-up): the solver is CPU-bound and runs for up to
    // 120s. If we did the whole job inside the outer TenantAwareJob transaction,
    // the `SET status='running'` update would hold a row-level exclusive lock
    // on `scheduling_runs` for the full solve duration, blocking any concurrent
    // cancel on the same run until the worker committed. Split the work into
    // three steps, each in its own short transaction, so the run row is free
    // for cancels during the CPU-bound phase:
    //
    //   1. Short txn: load + flip status to 'running' (row lock released on commit)
    //   2. No txn:    run solver in pure JS (no DB work, no lock)
    //   3. Short txn: write results, but ONLY if the admin hasn't cancelled —
    //                 a conditional `updateMany` respects a prior cancel.

    // ─── Step 1: claim the run ────────────────────────────────────────────
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      const row = await tx.schedulingRun.findFirst({ where: { id: run_id } });
      if (!row || row.status !== 'queued') {
        return null;
      }
      await tx.schedulingRun.update({
        where: { id: run_id },
        data: { status: 'running' },
      });
      return row;
    });

    if (!run) {
      this.logger.warn(`Run ${run_id} not found or not in queued status, skipping`);
      return;
    }

    // ─── Step 2: run the solver (no DB, no lock) ──────────────────────────
    const configSnapshot = run.config_snapshot as unknown as SolverInputV2 | null;

    if (!configSnapshot) {
      throw new Error('No config_snapshot found on scheduling run');
    }

    if (run.solver_seed !== null) {
      configSnapshot.settings.solver_seed = Number(run.solver_seed);
    }

    this.logger.log(
      `Starting solver v2 for run ${run_id}: ${configSnapshot.year_groups.length} year groups, ${configSnapshot.curriculum.length} curriculum entries, ${configSnapshot.teachers.length} teachers`,
    );

    let lastExtend = Date.now();
    const EXTEND_INTERVAL_MS = 60_000;

    const result = solveV2(configSnapshot, {
      onProgress: (assigned, total, phase) => {
        this.logger.debug(`Solver v2 progress: ${assigned}/${total} (${phase})`);

        // Extend BullMQ lock to prevent stall detection during long solves
        if (Date.now() - lastExtend >= EXTEND_INTERVAL_MS) {
          this.job.extendLock(this.job.token!, 300_000).catch((extendErr) => {
            this.logger.warn(`Failed to extend lock for run ${data.run_id}: ${extendErr}`);
          });
          lastExtend = Date.now();
          this.logger.debug(`Extended job lock for solver run ${data.run_id}`);
        }
      },
    });

    // 5. Save results.
    //
    // A run with any unassigned curriculum demand must NOT be reported as
    // `completed` — that shape lets an admin click Apply and silently publish
    // a partial timetable (SCHED-017). Classify the run explicitly:
    //
    //   entries_unassigned === 0 → completed  (every demand placed)
    //   entries_unassigned  >  0 → failed     (solver couldn't place all demand)
    //
    // `failed_reason` enumerates the first ~20 unplaceable slots so admins can
    // see exactly what didn't fit. Once the SchedulingRunStatus enum gains a
    // `partial` value we can distinguish genuine infeasibility from
    // time-limited partial solves — until then the stricter `failed` surface
    // is safer than a false `completed`.
    const resultJson = {
      entries: result.entries,
      unassigned: result.unassigned,
      // SCHED-026: surface quality metrics (gap index, day variance, preference
      // breakdown) so admins can compare runs and auditors have durable
      // evidence of schedule shape.
      quality_metrics: result.quality_metrics ?? null,
      // SCHED-023: persist the class-subject override audit so admins can see
      // which classes deviated from the year-group curriculum. Array copy
      // rather than reference to keep the snapshot immutable.
      overrides_applied: configSnapshot.overrides_applied
        ? [...configSnapshot.overrides_applied]
        : [],
    };

    const unassignedCount = result.unassigned.length;
    const finalStatus = unassignedCount === 0 ? 'completed' : 'failed';
    const failureReason =
      unassignedCount === 0
        ? null
        : `Solver left ${unassignedCount} curriculum slot${unassignedCount === 1 ? '' : 's'} unplaced. First: ${result.unassigned
            .slice(0, 20)
            .map((u) => JSON.stringify(u))
            .join('; ')}${unassignedCount > 20 ? ' …' : ''}`;

    // ─── Step 3: persist results (conditional on status='running') ────────
    // Use `updateMany` with `status: 'running'` so a cancel that landed during
    // the solve (flipping status to 'failed' with 'Cancelled by user') is not
    // silently overwritten by this final write. If the cancel won the race,
    // updateMany returns { count: 0 } and we log + exit without touching the
    // record.
    const writeResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      return tx.schedulingRun.updateMany({
        where: { id: run_id, status: 'running' },
        data: {
          status: finalStatus,
          failure_reason: failureReason,
          result_json: JSON.parse(JSON.stringify(resultJson)),
          hard_constraint_violations: result.constraint_summary.tier1_violations,
          soft_preference_score: result.score,
          soft_preference_max: result.max_score,
          entries_generated: result.entries.filter((e) => !e.is_pinned).length,
          entries_pinned: result.entries.filter((e) => e.is_pinned).length,
          entries_unassigned: unassignedCount,
          solver_duration_ms: result.duration_ms,
          solver_seed:
            configSnapshot.settings.solver_seed !== null
              ? BigInt(configSnapshot.settings.solver_seed)
              : BigInt(0),
        },
      });
    });

    if (writeResult.count === 0) {
      this.logger.log(
        `Solver v2 results for run ${run_id} discarded — run was cancelled while solving`,
      );
      return;
    }

    this.logger.log(
      `Solver v2 ${finalStatus} for run ${run_id}: ${result.entries.length} entries, ${unassignedCount} unassigned, score ${result.score}/${result.max_score} in ${result.duration_ms}ms`,
    );
  }
}
