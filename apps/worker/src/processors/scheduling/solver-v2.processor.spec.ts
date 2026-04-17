/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Job } from 'bullmq';

jest.mock('../../../../../packages/shared/src/scheduler', () => {
  class CpSatSolveError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
      public readonly details?: unknown,
    ) {
      super(message);
      this.name = 'CpSatSolveError';
    }
  }
  return {
    solveViaCpSatV3: jest.fn(),
    CpSatSolveError,
  };
});

import { CpSatSolveError, solveViaCpSatV3 } from '../../../../../packages/shared/src/scheduler';

import {
  SCHEDULING_SOLVE_V2_JOB,
  type SchedulingSolverV2Payload,
  SchedulingSolverV2Processor,
} from './solver-v2.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx(options?: {
  run?: {
    config_snapshot: {
      demand: unknown[];
      settings: { solver_seed: number | null; max_solver_duration_seconds?: number };
      teachers: unknown[];
      classes: unknown[];
    } | null;
    solver_seed: bigint | null;
    status: string;
  } | null;
}) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    schedulingRun: {
      findFirst: jest.fn().mockResolvedValue(
        options?.run === undefined
          ? {
              config_snapshot: {
                demand: [{ class_id: 'c1' }, { class_id: 'c2' }, { class_id: 'c3' }],
                settings: { solver_seed: null },
                teachers: [{ staff_profile_id: 't1' }, { staff_profile_id: 't2' }],
                classes: [{ class_id: 'c1' }, { class_id: 'c2' }],
              },
              solver_seed: BigInt(123),
              status: 'queued',
            }
          : options.run,
      ),
      update: jest.fn().mockResolvedValue({ id: RUN_ID }),
      // SCHED-027 follow-up: the final write uses updateMany with a
      // status='running' guard so a concurrent cancel isn't clobbered.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
    schedulingRun: {
      update: jest.fn().mockResolvedValue({ id: RUN_ID }),
    },
  };
}

function buildJob(
  name: string = SCHEDULING_SOLVE_V2_JOB,
  data: Partial<SchedulingSolverV2Payload> = {},
): Job<SchedulingSolverV2Payload> {
  return {
    data: {
      run_id: RUN_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<SchedulingSolverV2Payload>;
}

describe('SchedulingSolverV2Processor', () => {
  const mockSolveV3 = jest.mocked(solveViaCpSatV3);

  beforeEach(() => {
    mockSolveV3.mockResolvedValue({
      solve_status: 'FEASIBLE',
      hard_violations: 2,
      duration_ms: 1234,
      entries: [
        { id: 'entry-1', is_pinned: false },
        { id: 'entry-2', is_pinned: true },
      ],
      soft_max_score: 100,
      soft_score: 87,
      unassigned: [{ id: 'unassigned-1' }],
      quality_metrics: {
        teacher_gap_index: { min: 0, avg: 0, max: 0 },
        day_distribution_variance: { min: 0, avg: 0, max: 0 },
        preference_breakdown: [],
        cp_sat_objective_value: null,
        greedy_hint_score: 0,
        cp_sat_improved_on_greedy: false,
      },
      objective_breakdown: [],
      constraint_snapshot: [],
      early_stop_triggered: false,
      early_stop_reason: 'not_triggered',
      time_saved_ms: 0,
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob('scheduling:other-job'));

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await expect(
      processor.process(buildJob(SCHEDULING_SOLVE_V2_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should skip runs that are missing', async () => {
    const mockTx = buildMockTx({ run: null });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.schedulingRun.update).not.toHaveBeenCalled();
    expect(mockSolveV3).not.toHaveBeenCalled();
  });

  it('should skip runs already in a terminal status (e.g. cancelled/completed)', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          demand: [],
          settings: { solver_seed: null },
          teachers: [],
          classes: [],
        },
        solver_seed: null,
        status: 'completed',
      },
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.schedulingRun.update).not.toHaveBeenCalled();
    expect(mockSolveV3).not.toHaveBeenCalled();
  });

  // SCHED-029 (STRESS-081): if BullMQ stall-retry fires after a prior worker
  // crashed mid-solve, the row is left in 'running'. Treat as crash recovery:
  // mark failed with a clear reason and exit, rather than silently no-opping.
  it('should mark a run as failed when it is found in running status (BullMQ crash-retry)', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          demand: [],
          settings: { solver_seed: null },
          teachers: [],
          classes: [],
        },
        solver_seed: null,
        status: 'running',
      },
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.schedulingRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'failed',
        failure_reason: expect.stringContaining('Worker crashed mid-solve'),
      },
    });
    expect(mockSolveV3).not.toHaveBeenCalled();
  });

  it('should run the solver, apply the stored seed, and persist the completed run result', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.schedulingRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: RUN_ID },
      data: { status: 'running' },
    });
    expect(mockSolveV3).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          solver_seed: 123,
        }),
      }),
      expect.objectContaining({
        baseUrl: expect.stringMatching(/^http/),
        timeoutMs: expect.any(Number),
        requestId: RUN_ID,
      }),
    );
    expect(mockTx.schedulingRun.updateMany).toHaveBeenCalledWith({
      where: { id: RUN_ID, status: 'running' },
      data: expect.objectContaining({
        entries_generated: 1,
        entries_pinned: 1,
        entries_unassigned: 1,
        hard_constraint_violations: 2,
        result_json: expect.objectContaining({
          entries: [
            { id: 'entry-1', is_pinned: false },
            { id: 'entry-2', is_pinned: true },
          ],
          unassigned: [{ id: 'unassigned-1' }],
          // Stage 6 observability meta + Stage 9.5.1 §E early-stop fields +
          // SCHED-041 §A solver-diagnostics mirror. The diagnostics keys are
          // all ``null`` here because the mocked V3 response carries no
          // ``solver_diagnostics`` block — the worker's ``?? null`` fallback
          // is the code path exercised.
          meta: expect.objectContaining({
            solve_status: 'FEASIBLE',
            sidecar_duration_ms: 1234,
            placed_count: 2,
            unassigned_count: 1,
            early_stop_triggered: false,
            early_stop_reason: 'not_triggered',
            time_saved_ms: 0,
            termination_reason: null,
            improvements_found: null,
            cp_sat_improved_on_greedy: null,
            greedy_hint_score: null,
            final_objective_value: null,
            first_solution_wall_time_seconds: null,
          }),
        }),
        soft_preference_max: 100,
        soft_preference_score: 87,
        solver_duration_ms: 1234,
        solver_seed: BigInt(123),
        // Post-``c9ec9395`` (feasibility-preview / tiered-completion commit):
        // ``finalStatus`` is hardcoded ``'completed'`` whenever the solver
        // produced output, even with unassigned demand. The UI classifies
        // the quality (100 % / partial / incomplete) from placed-vs-total,
        // so the DB status only distinguishes "solver ran" from "solver
        // failed". ``failure_reason`` still enumerates unplaced slots.
        status: 'completed',
        failure_reason: expect.stringContaining('1 curriculum slot'),
      }),
    });
  });

  it('should mark the run as completed when every slot is placed (zero unassigned)', async () => {
    mockSolveV3.mockResolvedValueOnce({
      solve_status: 'OPTIMAL',
      hard_violations: 0,
      duration_ms: 500,
      entries: [{ id: 'entry-1', is_pinned: false }],
      soft_max_score: 100,
      soft_score: 100,
      unassigned: [],
      quality_metrics: {
        teacher_gap_index: { min: 0, avg: 0, max: 0 },
        day_distribution_variance: { min: 0, avg: 0, max: 0 },
        preference_breakdown: [],
        cp_sat_objective_value: null,
        greedy_hint_score: 0,
        cp_sat_improved_on_greedy: false,
      },
      objective_breakdown: [],
      constraint_snapshot: [],
      early_stop_triggered: false,
      early_stop_reason: 'not_triggered',
      time_saved_ms: 0,
    } as never);
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    // Step 1: flip to running (update)
    expect(mockTx.schedulingRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { status: 'running' },
    });

    // Step 3: conditional write of results (updateMany guarded by status)
    expect(mockTx.schedulingRun.updateMany).toHaveBeenCalledWith({
      where: { id: RUN_ID, status: 'running' },
      data: expect.objectContaining({
        status: 'completed',
        failure_reason: null,
        entries_unassigned: 0,
      }),
    });
  });

  it('should discard solver results when a cancel won the race (updateMany returns count: 0)', async () => {
    const mockTx = buildMockTx();
    // Override: simulate cancel having landed — conditional updateMany matches
    // no rows because status is no longer 'running'.
    mockTx.schedulingRun.updateMany.mockResolvedValue({ count: 0 });

    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    // Return empty unassigned so the finalStatus would have been 'completed'
    mockSolveV3.mockResolvedValue({
      constraint_summary: { tier1_violations: 0 },
      duration_ms: 1200,
      entries: [{ id: 'entry-1', is_pinned: false }],
      max_score: 100,
      score: 87,
      unassigned: [],
      cp_sat_status: 'optimal',
    } as never);

    await processor.process(buildJob());

    // updateMany was called (with the guard) but matched zero rows — worker
    // exits cleanly without throwing.
    expect(mockTx.schedulingRun.updateMany).toHaveBeenCalledWith({
      where: { id: RUN_ID, status: 'running' },
      data: expect.any(Object),
    });
  });

  it('should mark the run as failed and rethrow when the solver crashes', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );
    mockSolveV3.mockRejectedValue(new Error('solver exploded'));

    await expect(processor.process(buildJob())).rejects.toThrow('solver exploded');

    // Stage 6 wired the failure-path update into a $transaction so the RLS
    // policy on scheduling_runs sees a tenant context. The update lands on
    // the tx mock, not the top-level prisma client.
    expect(mockTx.schedulingRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        failure_reason: 'solver exploded',
        status: 'failed',
      },
    });
  });

  // Stage 7 carryover §2: the HTTP fetch timeout must never drop below a floor
  // (default 120 s, overridable via CP_SAT_REQUEST_TIMEOUT_FLOOR_MS) so a
  // tenant with a small budget (e.g. 30 s) doesn't race the sidecar's presolve
  // phase and trip the AbortController early.
  it('should clamp the HTTP timeout to the floor when the tenant budget is below it', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          demand: [],
          settings: { solver_seed: null, max_solver_duration_seconds: 30 },
          teachers: [],
          classes: [],
        },
        solver_seed: null,
        status: 'queued',
      },
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    // budget = (30 + 60) * 1000 = 90 000; floor = 120 000 → floor wins.
    expect(mockSolveV3).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeoutMs: 120000 }),
    );
  });

  it('should use the budget-derived timeout when it exceeds the floor', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          demand: [],
          settings: { solver_seed: null, max_solver_duration_seconds: 120 },
          teachers: [],
          classes: [],
        },
        solver_seed: null,
        status: 'queued',
      },
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );

    await processor.process(buildJob());

    // budget = (120 + 60) * 1000 = 180 000; floor = 120 000 → budget wins.
    expect(mockSolveV3).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeoutMs: 180000 }),
    );
  });

  // Stage 6: sidecar unreachable / sidecar errors surface as CpSatSolveError.
  // The worker prefixes the error code so operators can bucket failures by
  // grep'ing ``failure_reason`` in ``scheduling_runs``.
  it('should mark the run as failed with CP-SAT error code when the sidecar throws', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );
    mockSolveV3.mockRejectedValue(new CpSatSolveError('CP_SAT_UNREACHABLE', 'fetch failed', 0));

    await expect(processor.process(buildJob())).rejects.toThrow('fetch failed');

    expect(mockTx.schedulingRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'failed',
        failure_reason: 'CP_SAT_UNREACHABLE: fetch failed',
      },
    });
  });
});
