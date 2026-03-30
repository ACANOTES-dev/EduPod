import { Job } from 'bullmq';

import { SEARCH_INDEX_ENTITY_JOB, SearchIndexProcessor } from './search-index.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOUSEHOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ASSIGNMENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    student: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    parent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    staffProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    household: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    homeworkAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
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

describe('SearchIndexProcessor', () => {
  let processor: SearchIndexProcessor;
  let mockTx: MockTx;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new SearchIndexProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with a different name', async () => {
      const job = buildMockJob('some-other-job', { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockTx.student.findFirst).not.toHaveBeenCalled();
    });

    it('should reject jobs without tenant_id', async () => {
      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        entity_type: 'student',
        entity_id: STUDENT_ID,
        action: 'upsert',
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Job rejected: missing tenant_id in payload.',
      );
    });
  });

  // ─── Student indexing ─────────────────────────────────────────────────

  describe('process — student upsert', () => {
    it('should build a student document from DB when action is upsert', async () => {
      mockTx.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Ahmed',
        last_name: 'Hassan',
        full_name: 'Ahmed Hassan',
        first_name_ar: null,
        last_name_ar: null,
        full_name_ar: null,
        student_number: 'STU-001',
        status: 'active',
        year_group: { name: 'Year 5' },
        household: { household_name: 'Hassan Family' },
      });

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'student',
        entity_id: STUDENT_ID,
        action: 'upsert',
      });

      await processor.process(job);

      expect(mockTx.student.findFirst).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          full_name: true,
          student_number: true,
        }),
      });
    });

    it('should skip silently when student entity not found during upsert', async () => {
      mockTx.student.findFirst.mockResolvedValue(null);

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'student',
        entity_id: STUDENT_ID,
        action: 'upsert',
      });

      // Should complete without error
      await processor.process(job);

      expect(mockTx.student.findFirst).toHaveBeenCalled();
    });
  });

  // ─── Parent indexing ──────────────────────────────────────────────────

  describe('process — parent upsert', () => {
    it('should query the parent table for parent entity type', async () => {
      mockTx.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'Fatima',
        last_name: 'Ali',
        email: 'fatima@example.com',
        phone: '+353861234567',
        status: 'active',
      });

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'parent',
        entity_id: PARENT_ID,
        action: 'upsert',
      });

      await processor.process(job);

      expect(mockTx.parent.findFirst).toHaveBeenCalledWith({
        where: { id: PARENT_ID, tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        }),
      });
    });
  });

  // ─── Staff indexing ───────────────────────────────────────────────────

  describe('process — staff upsert', () => {
    it('should query staffProfile for staff entity type', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        staff_number: 'STAFF-001',
        job_title: 'Teacher',
        department: 'Maths',
        employment_status: 'active',
        user: { first_name: 'John', last_name: 'Smith', email: 'john@example.com' },
      });

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'staff',
        entity_id: STAFF_ID,
        action: 'upsert',
      });

      await processor.process(job);

      expect(mockTx.staffProfile.findFirst).toHaveBeenCalledWith({
        where: { id: STAFF_ID, tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          staff_number: true,
          job_title: true,
        }),
      });
    });
  });

  // ─── Household indexing ───────────────────────────────────────────────

  describe('process — household upsert', () => {
    it('should query household for household entity type', async () => {
      mockTx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Hassan Family',
        city: 'Dublin',
        status: 'active',
      });

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'household',
        entity_id: HOUSEHOLD_ID,
        action: 'upsert',
      });

      await processor.process(job);

      expect(mockTx.household.findFirst).toHaveBeenCalledWith({
        where: { id: HOUSEHOLD_ID, tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          household_name: true,
          city: true,
          status: true,
        }),
      });
    });
  });

  // ─── Homework assignment indexing ─────────────────────────────────────

  describe('process — homework_assignment upsert', () => {
    it('should query homeworkAssignment and only index if published', async () => {
      mockTx.homeworkAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        title: 'Math Worksheet',
        description: 'Chapter 5 exercises',
        homework_type: 'worksheet',
        status: 'published',
        class_entity: { name: 'Year 5 Maths' },
        subject: { name: 'Mathematics' },
        assigned_by: { first_name: 'John', last_name: 'Smith' },
      });

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'homework_assignment',
        entity_id: ASSIGNMENT_ID,
        action: 'upsert',
      });

      await processor.process(job);

      expect(mockTx.homeworkAssignment.findFirst).toHaveBeenCalledWith({
        where: { id: ASSIGNMENT_ID, tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          title: true,
          status: true,
        }),
      });
    });

    it('should skip indexing homework_assignment that is not published', async () => {
      mockTx.homeworkAssignment.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        title: 'Draft Homework',
        description: 'Not ready yet',
        homework_type: 'worksheet',
        status: 'draft',
        class_entity: { name: 'Year 5 Maths' },
        subject: { name: 'Mathematics' },
        assigned_by: { first_name: 'John', last_name: 'Smith' },
      });

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'homework_assignment',
        entity_id: ASSIGNMENT_ID,
        action: 'upsert',
      });

      // Should complete without error, but the stub log should still fire
      await processor.process(job);

      expect(mockTx.homeworkAssignment.findFirst).toHaveBeenCalled();
      // The processor logs its stub message
      expect(logSpy).toHaveBeenCalled();
    });
  });

  // ─── Delete action ────────────────────────────────────────────────────

  describe('process — delete action', () => {
    it('should handle delete action without querying entity from DB', async () => {
      const job = buildMockJob(SEARCH_INDEX_ENTITY_JOB, {
        tenant_id: TENANT_ID,
        entity_type: 'student',
        entity_id: STUDENT_ID,
        action: 'delete',
      });

      await processor.process(job);

      // Delete does not need to look up the entity in the DB
      expect(mockTx.student.findFirst).not.toHaveBeenCalled();
    });
  });
});
