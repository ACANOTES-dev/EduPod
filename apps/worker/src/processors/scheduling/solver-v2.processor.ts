import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CpSatSolveError, solveViaCpSat } from '../../../../../packages/shared/src/scheduler';
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
      // CpSatSolveError carries a code (CP_SAT_UNREACHABLE, INTERNAL_ERROR, …);
      // prefix it so operators can bucket failures by grep'ing failure_reason.
      const message =
        err instanceof CpSatSolveError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown solver v2 error';
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

  /**
   * Stage 9.5.1 post-close amendment follow-up: ``TenantAwareJob`` defaults to
   * a 5-minute interactive-transaction timeout. The §D budget ceiling raise
   * to 3600s means a long-budget solve can run up to 601s sidecar time + HTTP
   * overhead. Because ``processJob`` below uses ``this.prisma.$transaction``
   * for every DB write (steps 1 and 3) and does NOT use the outer ``_tx``,
   * the outer TenantAwareJob transaction sits idle for the full solve while
   * holding its pool connection — and Prisma errors on commit with
   * ``Transaction already closed`` once it crosses the 5-min ceiling. (NHQS
   * re-smoke ``18cce701`` at 600s budget produced exactly this — 373 placed,
   * 65 unassigned, overwritten by a Prisma timeout in the outer catch.)
   *
   * Fix: bump this job's timeout to 3780s = 3600s budget + 60s HTTP slack +
   * 120s presolve/orchestration buffer. Matches the HTTP timeout formula in
   * ``processJob`` (``(budget + 60) * 1000``) with additional room for the
   * pre-solve claim + post-solve write. Memory cost is negligible — the
   * outer transaction is a single idle connection per active solve.
   *
   * Long-term (Part 2): refactor SchedulingSolverV2Job to not extend
   * TenantAwareJob at all, since every DB write already uses its own
   * short transaction. The outer wrapper is currently load-bearing only
   * for the tenant-id / user-id validation it does — that can move into
   * the processor directly.
   */
  protected override readonly transactionTimeoutMs: number = 3780 * 1000;

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
    //
    // SCHED-029 (STRESS-081): if BullMQ stall-detection eventually re-queues
    // a job whose previous worker crashed mid-solve, the DB row will be in
    // 'running' status (Step 1 committed before the crash). Treat that as
    // crash recovery: mark the row 'failed' and exit cleanly so the tenant
    // is unblocked rather than silently no-opping.
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      const row = await tx.schedulingRun.findFirst({ where: { id: run_id } });
      if (!row) {
        return { row: null as null, outcome: 'missing' as const };
      }
      if (row.status === 'queued') {
        await tx.schedulingRun.update({
          where: { id: run_id },
          data: { status: 'running' },
        });
        return { row, outcome: 'claimed' as const };
      }
      if (row.status === 'running') {
        await tx.schedulingRun.update({
          where: { id: run_id },
          data: {
            status: 'failed',
            failure_reason: 'Worker crashed mid-solve — BullMQ retry reaped the run (SCHED-029)',
          },
        });
        return { row, outcome: 'crash-retry' as const };
      }
      return { row, outcome: 'terminal' as const };
    });

    if (claim.outcome === 'missing') {
      this.logger.warn(`Run ${run_id} not found, skipping`);
      return;
    }
    if (claim.outcome === 'terminal') {
      this.logger.warn(`Run ${run_id} already in terminal status "${claim.row?.status}", skipping`);
      return;
    }
    if (claim.outcome === 'crash-retry') {
      this.logger.warn(
        `Run ${run_id} was left in 'running' by a prior worker — marked failed and skipped`,
      );
      return;
    }

    // TS narrowing: 'claimed' implies row is non-null (queued branch path).
    const run = claim.row;
    if (!run) {
      this.logger.warn(`Run ${run_id} unexpectedly null after claim, skipping`);
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

    // CP-SAT runs inside the sidecar; we have no per-phase progress callback
    // any more, so keep the BullMQ lock alive on a plain interval. The
    // sidecar's budget is ``max_solver_duration_seconds`` and the HTTP cap
    // below gives it +30 s for round-trip + presolve. Clearing the interval
    // on both success and failure keeps the Node process from hanging after
    // the job resolves.
    const EXTEND_INTERVAL_MS = 60_000;
    const extendTimer = setInterval(() => {
      this.job.extendLock(this.job.token!, 300_000).catch((extendErr) => {
        this.logger.warn(`Failed to extend lock for run ${data.run_id}: ${extendErr}`);
      });
    }, EXTEND_INTERVAL_MS);

    const sidecarUrl = process.env.SOLVER_PY_URL ?? 'http://localhost:5557';
    // Stage 7 carryover §2: clients must give the sidecar ≥ 90 s of breathing
    // room on Tier-3-scale solves (61 s wall under single-worker). We enforce
    // a 120 s floor (overridable via CP_SAT_REQUEST_TIMEOUT_FLOOR_MS) and bump
    // the per-tenant budget by +60 s instead of the old +30 s so a tenant
    // running at the default `max_solver_duration_seconds = 60` no longer
    // sits right on the edge of the HTTP timeout.
    const timeoutFloorMs = Number.parseInt(
      process.env.CP_SAT_REQUEST_TIMEOUT_FLOOR_MS ?? '120000',
      10,
    );
    const budgetTimeoutMs = (configSnapshot.settings.max_solver_duration_seconds + 60) * 1000;
    const timeoutMs = Math.max(timeoutFloorMs, budgetTimeoutMs);
    let result;
    try {
      result = await solveViaCpSat(configSnapshot, {
        baseUrl: sidecarUrl,
        timeoutMs,
        requestId: run_id,
      });
    } finally {
      clearInterval(extendTimer);
    }

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
    // Stage 6 observability meta — surfaced on ``result_json.meta`` so Stage 7's
    // observation window and Stage 12's diagnostics have a durable signal per
    // run without joining across tables. ``cp_sat_status`` is the sidecar's
    // own solver state; ``sidecar_duration_ms`` is the time reported *by* the
    // sidecar (CPU-bound solve), distinct from any HTTP overhead the worker
    // sees. ``placed_count`` / ``unassigned_count`` duplicate the row-level
    // columns for convenience when inspecting the JSON directly.
    //
    // Stage 9.5.1 §E adds ``early_stop_triggered`` / ``early_stop_reason`` /
    // ``time_saved_ms`` — when the EarlyStopCallback halted the solver before
    // the budget was exhausted, these are the durable signal that the larger
    // budget ceiling raised in §D didn't waste compute. Falsy defaults keep
    // the meta block well-formed against older sidecar responses.
    const placedCount = result.entries.length;
    const unassignedCount = result.unassigned.length;
    const cpSatStatus = result.cp_sat_status ?? 'unknown';
    const sidecarDurationMs = result.duration_ms;
    const earlyStopTriggered = result.early_stop_triggered ?? false;
    const earlyStopReason = result.early_stop_reason ?? 'not_triggered';
    const timeSavedMs = result.time_saved_ms ?? 0;
    const meta = {
      cp_sat_status: cpSatStatus,
      sidecar_duration_ms: sidecarDurationMs,
      placed_count: placedCount,
      unassigned_count: unassignedCount,
      early_stop_triggered: earlyStopTriggered,
      early_stop_reason: earlyStopReason,
      time_saved_ms: timeSavedMs,
    };

    const resultJson = {
      // Stage 10: tag every persisted run so consumers can branch on the
      // schema version. All runs produced by this worker are V2 until
      // Stage 11 switches to solveViaCpSatV3.
      result_schema_version: 'v2' as const,
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
      meta,
    };

    // One structured log line per solve — captured by pm2 / journald and
    // grep-able by ``run_id`` or ``cp_sat_status`` during the Stage 7
    // observation window.
    this.logger.log(
      `cp_sat.solve_complete ${JSON.stringify({
        run_id,
        tenant_id,
        cp_sat_status: cpSatStatus,
        sidecar_duration_ms: sidecarDurationMs,
        placed_count: placedCount,
        unassigned_count: unassignedCount,
        early_stop_triggered: earlyStopTriggered,
        early_stop_reason: earlyStopReason,
        time_saved_ms: timeSavedMs,
      })}`,
    );
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
