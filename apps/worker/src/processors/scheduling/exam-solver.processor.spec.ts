import { Job } from 'bullmq';

import {
  EXAM_SOLVE_JOB,
  ExamSolverProcessor,
  type ExamSolverPayload,
} from './exam-solver.processor';

function buildMockJob(name: string, data?: ExamSolverPayload): Job<ExamSolverPayload> {
  return {
    id: 'test-job',
    name,
    data:
      data ??
      ({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        solve_job_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        exam_session_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      } as ExamSolverPayload),
  } as unknown as Job<ExamSolverPayload>;
}

function buildMockPrisma() {
  return {
    $transaction: jest.fn(),
    examSolveJob: { update: jest.fn() },
  };
}

describe('ExamSolverProcessor', () => {
  let processor: ExamSolverProcessor;

  afterEach(() => jest.clearAllMocks());

  describe('process — job routing', () => {
    it('should skip jobs with a different name (sibling processor on same queue)', async () => {
      const mockPrisma = buildMockPrisma();
      processor = new ExamSolverProcessor(mockPrisma as never);

      await processor.process(buildMockJob('some-other-job'));

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should accept jobs with the EXAM_SOLVE_JOB name', () => {
      // Just verify the job-name constant is what we expect — guards against
      // accidental renames breaking queue routing.
      expect(EXAM_SOLVE_JOB).toBe('scheduling:exam-solve');
    });
  });
});
