import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CpSatSolveError, solveViaCpSatV3 } from '../../../../../packages/shared/src/scheduler';
import type { SolverInputV3 } from '../../../../../packages/shared/src/scheduler';
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
    const configSnapshot = run.config_snapshot as unknown as SolverInputV3 | null;

    if (!configSnapshot) {
      throw new Error('No config_snapshot found on scheduling run');
    }

    if (run.solver_seed !== null) {
      configSnapshot.settings.solver_seed = Number(run.solver_seed);
    }

    this.logger.log(
      `Starting solver v3 for run ${run_id}: ${configSnapshot.classes.length} classes, ${configSnapshot.demand.length} demand entries, ${configSnapshot.teachers.length} teachers`,
    );

    // CP-SAT runs inside the sidecar; we have no per-phase progress callback
    // any more, so keep the BullMQ lock alive on a plain interval. The
    // sidecar's budget is ``max_solver_duration_seconds`` and the HTTP cap
    // below gives it +30 s for round-trip + presolve. Clearing the interval
    // on both success and failure keeps the Node process from hanging after
    // the job resolves.
    //
    // Heartbeat: the same interval also bumps ``scheduling_runs.updated_at``
    // so GET /progress can surface a "last heard from worker" timestamp.
    // Prior behaviour left ``updated_at`` frozen at solve-start for the
    // entire run (observed 2026-04-17 NHQS run 5a38a832 — updated_at sat
    // at 15:12:59 for 60 min while the worker was clearly alive). Without
    // a heartbeat there's no way for operators to distinguish a healthy
    // long solve from a wedged worker.
    const EXTEND_INTERVAL_MS = 60_000;
    const extendTimer = setInterval(() => {
      this.job.extendLock(this.job.token!, 300_000).catch((extendErr) => {
        this.logger.warn(`Failed to extend lock for run ${data.run_id}: ${extendErr}`);
      });
      this.prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
          // Bump ``updated_at`` via raw SQL so the column moves without
          // requiring a fake-field update through Prisma's type-checked
          // client. Scoped to status='running' so we never overwrite a
          // terminal state if this heartbeat races a just-landed solver
          // write in the main path below.
          await tx.$executeRaw`UPDATE scheduling_runs SET updated_at = NOW() WHERE id = ${run_id}::uuid AND status = 'running'`;
        })
        .catch((heartbeatErr) => {
          // Heartbeat failures are non-fatal — log and keep solving. The
          // solve itself does not depend on heartbeat success.
          this.logger.warn(`Heartbeat update failed for run ${data.run_id}: ${heartbeatErr}`);
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
      result = await solveViaCpSatV3(configSnapshot, {
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
    // V3 output fields — all required, no fallback needed.
    const placedCount = result.entries.length;
    const unassignedCount = result.unassigned.length;
    const solveStatus = result.solve_status;
    const sidecarDurationMs = result.duration_ms;
    const earlyStopTriggered = result.early_stop_triggered;
    const earlyStopReason = result.early_stop_reason;
    const timeSavedMs = result.time_saved_ms;
    // SCHED-041 §A — structured CP-SAT telemetry. Optional during rollout:
    // older sidecar builds omit `solver_diagnostics` entirely, and the
    // MODEL_INVALID / transport-failure paths return before capture, so
    // normalise to `null` for the DB column.
    const solverDiagnostics = result.solver_diagnostics ?? null;
    const meta = {
      solve_status: solveStatus,
      sidecar_duration_ms: sidecarDurationMs,
      placed_count: placedCount,
      unassigned_count: unassignedCount,
      early_stop_triggered: earlyStopTriggered,
      early_stop_reason: earlyStopReason,
      time_saved_ms: timeSavedMs,
      // Mirror the key SCHED-041 §A signals into result_json.meta so admin
      // tools that already read meta see the new fields without needing to
      // query the separate solver_diagnostics column. The column remains
      // the authoritative queryable source.
      termination_reason: solverDiagnostics?.termination_reason ?? null,
      improvements_found: solverDiagnostics?.improvements_found ?? null,
      cp_sat_improved_on_greedy: solverDiagnostics?.cp_sat_improved_on_greedy ?? null,
      greedy_hint_score: solverDiagnostics?.greedy_hint_score ?? null,
      final_objective_value: solverDiagnostics?.final_objective_value ?? null,
      first_solution_wall_time_seconds: solverDiagnostics?.first_solution_wall_time_seconds ?? null,
    };

    const resultJson = {
      result_schema_version: 'v3' as const,
      entries: result.entries,
      unassigned: result.unassigned,
      quality_metrics: result.quality_metrics,
      objective_breakdown: result.objective_breakdown,
      constraint_snapshot: result.constraint_snapshot,
      meta,
    };

    this.logger.log(
      `cp_sat.solve_complete ${JSON.stringify({
        run_id,
        tenant_id,
        solve_status: solveStatus,
        sidecar_duration_ms: sidecarDurationMs,
        placed_count: placedCount,
        unassigned_count: unassignedCount,
        early_stop_triggered: earlyStopTriggered,
        early_stop_reason: earlyStopReason,
        time_saved_ms: timeSavedMs,
        // SCHED-041 §A — key telemetry in the per-solve log line so `pm2 logs
        // worker | grep cp_sat.solve_complete` shows the full picture without
        // needing to join to the DB.
        termination_reason: solverDiagnostics?.termination_reason ?? null,
        improvements_found: solverDiagnostics?.improvements_found ?? null,
        cp_sat_improved_on_greedy: solverDiagnostics?.cp_sat_improved_on_greedy ?? null,
        greedy_hint_score: solverDiagnostics?.greedy_hint_score ?? null,
        final_objective_value: solverDiagnostics?.final_objective_value ?? null,
        num_branches: solverDiagnostics?.num_branches ?? null,
        num_conflicts: solverDiagnostics?.num_conflicts ?? null,
      })}`,
    );
    // Whenever the solver produced output (even with unassigned slots) the
    // run is `completed`. The UI categorises the RESULT into quality tiers
    // (100 % / partial / incomplete) by looking at placed vs total — so the
    // DB status only needs to distinguish "solver ran and wrote results"
    // from "solver crashed / was cancelled". `failed` is now reserved for
    // hard failures upstream (CP_SAT_UNREACHABLE, module-not-found, explicit
    // user cancel, etc.) which already flow through the outer `catch`.
    // `failure_reason` carries the unplaced-slot summary for partial runs so
    // the review page can surface exactly which demand could not be placed.
    const finalStatus = 'completed';
    const failureReason =
      unassignedCount === 0
        ? null
        : `Solver left ${unassignedCount} curriculum slot${unassignedCount === 1 ? '' : 's'} unplaced. First: ${result.unassigned
            .slice(0, 20)
            .map((u) => JSON.stringify(u))
            .join('; ')}${unassignedCount > 20 ? ' …' : ''}`;

    // ─── Step 3: persist results (conditional on status='running') ────────
    const writeResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      return tx.schedulingRun.updateMany({
        where: { id: run_id, status: 'running' },
        data: {
          status: finalStatus,
          failure_reason: failureReason,
          result_json: JSON.parse(JSON.stringify(resultJson)),
          hard_constraint_violations: result.hard_violations,
          soft_preference_score: result.soft_score,
          soft_preference_max: result.soft_max_score,
          entries_generated: result.entries.filter((e) => !e.is_pinned).length,
          entries_pinned: result.entries.filter((e) => e.is_pinned).length,
          entries_unassigned: unassignedCount,
          solver_duration_ms: result.duration_ms,
          solver_seed:
            configSnapshot.settings.solver_seed !== null
              ? BigInt(configSnapshot.settings.solver_seed)
              : BigInt(0),
          // SCHED-041 §A — persist structured CP-SAT telemetry to a dedicated
          // JSONB column so operators can query termination_reason /
          // improvements_found / cp_sat_improved_on_greedy directly without
          // parsing the (potentially hundreds of KB) result_json. Prisma's
          // nullable Json field requires ``Prisma.DbNull`` to write a SQL NULL
          // (passing plain ``null`` is a type error — it would be interpreted
          // as the JSON literal "null"). DbNull matches the pattern used in
          // behaviour/evaluate-policy + retention-check processors.
          solver_diagnostics: solverDiagnostics
            ? (JSON.parse(JSON.stringify(solverDiagnostics)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
    });

    if (writeResult.count === 0) {
      this.logger.log(
        `Solver v3 results for run ${run_id} discarded — run was cancelled while solving`,
      );
      return;
    }

    this.logger.log(
      `Solver v3 ${finalStatus} for run ${run_id}: ${result.entries.length} entries, ${unassignedCount} unassigned, score ${result.soft_score}/${result.soft_max_score} in ${result.duration_ms}ms`,
    );
  }
}
