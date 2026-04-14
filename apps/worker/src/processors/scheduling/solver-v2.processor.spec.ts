/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Job } from 'bullmq';

jest.mock('../../../../../packages/shared/src/scheduler', () => ({
  solveV2: jest.fn(),
}));

import { solveV2 } from '../../../../../packages/shared/src/scheduler';

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
  const mockSolveV2 = jest.mocked(solveV2);

  beforeEach(() => {
    mockSolveV2.mockReturnValue({
      constraint_summary: { tier1_violations: 2 },
      duration_ms: 1234,
      entries: [
        { id: 'entry-1', is_pinned: false },
        { id: 'entry-2', is_pinned: true },
      ],
      max_score: 100,
      score: 87,
      unassigned: [{ id: 'unassigned-1' }],
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

  it('should skip runs that are missing or not queued', async () => {
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

    expect(mockTx.schedulingRun.update).not.toHaveBeenCalled();
    expect(mockSolveV2).not.toHaveBeenCalled();
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
    expect(mockSolveV2).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          solver_seed: 123,
        }),
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
      }),
    );
    expect(mockTx.schedulingRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: RUN_ID },
      data: expect.objectContaining({
        entries_generated: 1,
        entries_pinned: 1,
        entries_unassigned: 1,
        hard_constraint_violations: 2,
        result_json: {
          entries: [
            { id: 'entry-1', is_pinned: false },
            { id: 'entry-2', is_pinned: true },
          ],
          unassigned: [{ id: 'unassigned-1' }],
        },
        soft_preference_max: 100,
        soft_preference_score: 87,
        solver_duration_ms: 1234,
        solver_seed: BigInt(123),
        status: 'completed',
      }),
    });
  });

  it('should mark the run as failed and rethrow when the solver crashes', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new SchedulingSolverV2Processor(
      mockPrisma as never,
      { process: jest.fn() } as never,
    );
    mockSolveV2.mockImplementation(() => {
      throw new Error('solver exploded');
    });

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
});
