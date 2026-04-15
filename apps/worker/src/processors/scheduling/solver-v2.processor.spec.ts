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
    solveViaCpSat: jest.fn(),
    CpSatSolveError,
  };
});

import { CpSatSolveError, solveViaCpSat } from '../../../../../packages/shared/src/scheduler';

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
      curriculum: unknown[];
      settings: { solver_seed: number | null };
      teachers: unknown[];
      year_groups: unknown[];
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
                curriculum: [{ id: 'curr-1' }, { id: 'curr-2' }, { id: 'curr-3' }],
                settings: { solver_seed: null },
                teachers: [{ id: 'teacher-1' }, { id: 'teacher-2' }],
                year_groups: [{ id: 'yg-1' }, { id: 'yg-2' }],
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
  const mockSolveViaCpSat = jest.mocked(solveViaCpSat);

  beforeEach(() => {
    mockSolveViaCpSat.mockResolvedValue({
      constraint_summary: { tier1_violations: 2 },
      duration_ms: 1234,
      entries: [
        { id: 'entry-1', is_pinned: false },
        { id: 'entry-2', is_pinned: true },
      ],
      max_score: 100,
      score: 87,
      unassigned: [{ id: 'unassigned-1' }],
      cp_sat_status: 'feasible',
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
    expect(mockSolveViaCpSat).not.toHaveBeenCalled();
  });

  it('should skip runs already in a terminal status (e.g. cancelled/completed)', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          curriculum: [],
          settings: { solver_seed: null },
          teachers: [],
          year_groups: [],
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
    expect(mockSolveViaCpSat).not.toHaveBeenCalled();
  });

  // SCHED-029 (STRESS-081): if BullMQ stall-retry fires after a prior worker
  // crashed mid-solve, the row is left in 'running'. Treat as crash recovery:
  // mark failed with a clear reason and exit, rather than silently no-opping.
  it('should mark a run as failed when it is found in running status (BullMQ crash-retry)', async () => {
    const mockTx = buildMockTx({
      run: {
        config_snapshot: {
          curriculum: [],
          settings: { solver_seed: null },
          teachers: [],
          year_groups: [],
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
    expect(mockSolveViaCpSat).not.toHaveBeenCalled();
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
    expect(mockSolveViaCpSat).toHaveBeenCalledWith(
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
          // Stage 6 observability meta — persisted alongside entries so Stage 7's
          // observation window and Stage 12's diagnostics can read the signal
          // without a cross-table join.
          meta: {
            cp_sat_status: 'feasible',
            sidecar_duration_ms: 1234,
            placed_count: 2,
            unassigned_count: 1,
          },
        }),
        soft_preference_max: 100,
        soft_preference_score: 87,
        solver_duration_ms: 1234,
        solver_seed: BigInt(123),
        // SCHED-017: any unassigned demand flips the run to `failed` with a
        // reason enumerating what couldn't be placed. Only zero-unassigned
        // runs count as `completed`.
        status: 'failed',
        failure_reason: expect.stringContaining('1 curriculum slot'),
      }),
    });
  });

  it('should mark the run as completed when every slot is placed (zero unassigned)', async () => {
    mockSolveViaCpSat.mockResolvedValueOnce({
      constraint_summary: { tier1_violations: 0 },
      duration_ms: 500,
      entries: [{ id: 'entry-1', is_pinned: false }],
      max_score: 100,
      score: 100,
      unassigned: [],
      cp_sat_status: 'optimal',
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
    mockSolveViaCpSat.mockResolvedValue({
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
    mockSolveViaCpSat.mockRejectedValue(new Error('solver exploded'));

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
    mockSolveViaCpSat.mockRejectedValue(
      new CpSatSolveError('CP_SAT_UNREACHABLE', 'fetch failed', 0),
    );

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
