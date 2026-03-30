import { Job } from 'bullmq';

import { BULK_IMPORT_PROCESS_JOB, BulkImportProcessor } from './bulk-import.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ASSESSMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const GRADE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    assessment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    grade: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: GRADE_ID }),
      update: jest.fn().mockResolvedValue({ id: GRADE_ID }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  };
}

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test-job-id', name, data } as unknown as Job;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('BulkImportProcessor', () => {
  let processor: BulkImportProcessor;
  let mockTx: MockTx;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new BulkImportProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with a different name', async () => {
      const job = buildMockJob('some-other-job', {
        tenant_id: TENANT_ID,
        rows: [],
        imported_by_user_id: USER_ID,
      });
      await processor.process(job);

      expect(mockTx.assessment.findFirst).not.toHaveBeenCalled();
    });

    it('should reject jobs without tenant_id', async () => {
      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        rows: [],
        imported_by_user_id: USER_ID,
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Job rejected: missing tenant_id in payload.',
      );
    });
  });

  // ─── New grade creation ───────────────────────────────────────────────

  describe('process — new grade creation', () => {
    it('should create a new grade when no existing grade is found', async () => {
      mockTx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      mockTx.grade.findFirst.mockResolvedValue(null);

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [
          {
            student_id: STUDENT_ID_1,
            assessment_id: ASSESSMENT_ID,
            score: 85,
          },
        ],
        imported_by_user_id: USER_ID,
      });

      await processor.process(job);

      expect(mockTx.grade.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          assessment_id: ASSESSMENT_ID,
          student_id: STUDENT_ID_1,
          raw_score: 85,
          is_missing: false,
          entered_by_user_id: USER_ID,
        }),
      });
    });
  });

  // ─── Existing grade update ────────────────────────────────────────────

  describe('process — existing grade update', () => {
    it('should update an existing grade instead of creating a new one', async () => {
      mockTx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      mockTx.grade.findFirst.mockResolvedValue({
        id: GRADE_ID,
        raw_score: 70,
      });

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [
          {
            student_id: STUDENT_ID_1,
            assessment_id: ASSESSMENT_ID,
            score: 90,
          },
        ],
        imported_by_user_id: USER_ID,
      });

      await processor.process(job);

      expect(mockTx.grade.update).toHaveBeenCalledWith({
        where: { id: GRADE_ID },
        data: expect.objectContaining({
          raw_score: 90,
          is_missing: false,
          entered_by_user_id: USER_ID,
        }),
      });
      expect(mockTx.grade.create).not.toHaveBeenCalled();
    });
  });

  // ─── Score clamping ───────────────────────────────────────────────────

  describe('process — score clamping', () => {
    it('should clamp score to max_score when score exceeds assessment max', async () => {
      mockTx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 50,
      });

      mockTx.grade.findFirst.mockResolvedValue(null);

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [
          {
            student_id: STUDENT_ID_1,
            assessment_id: ASSESSMENT_ID,
            score: 75, // Exceeds max_score of 50
          },
        ],
        imported_by_user_id: USER_ID,
      });

      await processor.process(job);

      expect(mockTx.grade.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          raw_score: 50, // Clamped to max_score
        }),
      });
    });
  });

  // ─── Skipping invalid assessments ─────────────────────────────────────

  describe('process — skipping invalid assessments', () => {
    it('should skip rows where the assessment does not exist', async () => {
      mockTx.assessment.findFirst.mockResolvedValue(null);

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [
          {
            student_id: STUDENT_ID_1,
            assessment_id: ASSESSMENT_ID,
            score: 85,
          },
        ],
        imported_by_user_id: USER_ID,
      });

      await processor.process(job);

      expect(mockTx.grade.create).not.toHaveBeenCalled();
      expect(mockTx.grade.update).not.toHaveBeenCalled();
    });
  });

  // ─── Multiple rows ───────────────────────────────────────────────────

  describe('process — multiple rows', () => {
    it('should process all rows in the payload', async () => {
      mockTx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      mockTx.grade.findFirst.mockResolvedValue(null);

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [
          { student_id: STUDENT_ID_1, assessment_id: ASSESSMENT_ID, score: 80 },
          { student_id: STUDENT_ID_2, assessment_id: ASSESSMENT_ID, score: 95 },
        ],
        imported_by_user_id: USER_ID,
      });

      await processor.process(job);

      expect(mockTx.grade.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log the processing start with row count', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(BULK_IMPORT_PROCESS_JOB, {
        tenant_id: TENANT_ID,
        rows: [{ student_id: STUDENT_ID_1, assessment_id: ASSESSMENT_ID, score: 80 }],
        imported_by_user_id: USER_ID,
      });

      // Assessment not found so row is skipped, but processing log fires
      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1 rows'));
    });
  });
});
