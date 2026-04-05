import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const DATE = new Date('2026-03-10');

// Mock the RLS middleware
const mockTx = {
  dailyAttendanceSummary: {
    upsert: jest.fn().mockResolvedValue({ id: 'summary-1' }),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

function makeRecord(status: string, sessionId = 'session-1', classId = 'class-1') {
  return {
    id: `record-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    attendance_session_id: sessionId,
    status,
    reason: null,
    session: {
      id: sessionId,
      class_id: classId,
      status: 'submitted',
    },
  };
}

describe('DailySummaryService', () => {
  let service: DailySummaryService;
  let mockPrisma: {
    attendanceRecord: { findMany: jest.Mock };
    dailyAttendanceSummary: { deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dailyAttendanceSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    // Reset the upsert mock
    mockTx.dailyAttendanceSummary.upsert.mockClear();
    mockTx.dailyAttendanceSummary.upsert.mockResolvedValue({ id: 'summary-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [DailySummaryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DailySummaryService>(DailySummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. Derive status 'present' when all sessions present ──────────────
  it('should derive status present when all sessions present', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('present', 'session-1'),
      makeRecord('present', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'present',
        }),
      }),
    );
  });

  // ─── 2. Derive status 'absent' when all sessions absent (unexcused) ────
  it('should derive status absent when all sessions absent unexcused', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('absent_unexcused', 'session-1'),
      makeRecord('absent_unexcused', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'absent',
        }),
      }),
    );
  });

  // ─── 3. Derive status 'excused' when all absent are excused ────────────
  it('should derive status excused when all absent are excused', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('absent_excused', 'session-1'),
      makeRecord('absent_excused', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'excused',
        }),
      }),
    );
  });

  // ─── 4. Derive status 'late' when late but no absences ─────────────────
  it('should derive status late when late but no absences', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('present', 'session-1'),
      makeRecord('late', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'late',
        }),
      }),
    );
  });

  // ─── 5. Derive status 'partially_absent' for mixed statuses ────────────
  it('should derive status partially_absent for mixed statuses', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('present', 'session-1'),
      makeRecord('absent_unexcused', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'partially_absent',
        }),
      }),
    );
  });

  // ─── 6. Count left_early as present ────────────────────────────────────
  it('should count left_early as present', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('left_early', 'session-1'),
      makeRecord('left_early', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    // left_early counts as present, so with no absences and no late -> 'present'
    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'present',
          derived_payload: expect.objectContaining({
            sessions_present: 2,
            sessions_absent: 0,
          }),
        }),
      }),
    );
  });

  // ─── 7. Delete summary when no records exist ──────────────────────────
  it('should delete summary when no records exist', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    const result = await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(result).toBeNull();
    expect(mockPrisma.dailyAttendanceSummary.deleteMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        summary_date: DATE,
      },
    });
    expect(mockTx.dailyAttendanceSummary.upsert).not.toHaveBeenCalled();
  });

  // ─── 8. Exclude cancelled sessions ─────────────────────────────────────
  it('should exclude cancelled sessions from summary (query filters them)', async () => {
    // The service filters with `status: { not: 'cancelled' }` in the Prisma query.
    // We simulate that the query already excludes cancelled sessions by returning
    // only non-cancelled records.
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('present', 'session-1'),
      // session-2 is cancelled and won't appear in query results
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    // Verify the findMany was called with the cancelled filter
    expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: expect.objectContaining({
            status: { not: 'cancelled' },
          }),
        }),
      }),
    );

    // Only 1 record should be counted
    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_payload: expect.objectContaining({
            sessions_total: 1,
          }),
        }),
      }),
    );
  });

  // ─── 9. Only count sessions where student was enrolled ─────────────────
  it('should only count sessions where student was enrolled', async () => {
    // The service queries only records that belong to the student.
    // Mock returns only 2 sessions where the student was actually enrolled.
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('present', 'session-1', 'class-1'),
      makeRecord('late', 'session-3', 'class-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_payload: expect.objectContaining({
            sessions_total: 2,
            sessions_present: 1,
            sessions_late: 1,
            session_details: expect.arrayContaining([
              expect.objectContaining({ session_id: 'session-1', class_id: 'class-1' }),
              expect.objectContaining({ session_id: 'session-3', class_id: 'class-2' }),
            ]),
          }),
        }),
      }),
    );
  });

  // ─── edge: mixed late + absent -> partially_absent ─────────────────────
  it('edge: should derive partially_absent when both late and absent', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('late', 'session-1'),
      makeRecord('absent_unexcused', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'partially_absent',
        }),
      }),
    );
  });

  // ─── edge: only late (no present, no absent) -> late ───────────────────
  it('edge: should derive late when only late records exist', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('late', 'session-1'),
      makeRecord('late', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'late',
        }),
      }),
    );
  });

  // ─── edge: mixed excused + unexcused -> absent ─────────────────────────
  it('edge: should derive absent when mix of excused and unexcused', async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      makeRecord('absent_excused', 'session-1'),
      makeRecord('absent_unexcused', 'session-2'),
    ]);

    await service.recalculate(TENANT_ID, STUDENT_ID, DATE);

    expect(mockTx.dailyAttendanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          derived_status: 'absent',
        }),
      }),
    );
  });
});

// ─── findAll tests ──────────────────────────────────────────────────────────

describe('DailySummaryService — findAll', () => {
  let service: DailySummaryService;
  let mockPrisma: {
    attendanceRecord: { findMany: jest.Mock };
    dailyAttendanceSummary: {
      findMany: jest.Mock;
      count: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dailyAttendanceSummary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DailySummaryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DailySummaryService>(DailySummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated results with default parameters', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([{ id: 'sum-1' }]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result).toEqual({
      data: [{ id: 'sum-1' }],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it('should filter by student_id when provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, student_id: STUDENT_ID });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student_id: STUDENT_ID }),
      }),
    );
  });

  it('should filter by start_date and end_date when provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      start_date: '2026-01-01',
      end_date: '2026-03-31',
    });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          summary_date: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-03-31'),
          },
        }),
      }),
    );
  });

  it('should filter by derived_status when provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, derived_status: 'absent' });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ derived_status: 'absent' }),
      }),
    );
  });

  it('should apply correct skip for page 2', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(25);

    await service.findAll(TENANT_ID, { page: 2, pageSize: 10 });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('should filter by start_date only when end_date is not provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, start_date: '2026-01-01' });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          summary_date: { gte: new Date('2026-01-01') },
        }),
      }),
    );
  });
});

// ─── findForStudent tests ────────────────────────────────────────────────────

describe('DailySummaryService — findForStudent', () => {
  let service: DailySummaryService;
  let mockPrisma: {
    attendanceRecord: { findMany: jest.Mock };
    dailyAttendanceSummary: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      dailyAttendanceSummary: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DailySummaryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DailySummaryService>(DailySummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return data for a specific student', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
      { summary_date: new Date('2026-03-10'), derived_status: 'present' },
    ]);

    const result = await service.findForStudent(TENANT_ID, STUDENT_ID, {});

    expect(result.data).toHaveLength(1);
  });

  it('should filter by date range when provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);

    await service.findForStudent(TENANT_ID, STUDENT_ID, {
      start_date: '2026-01-01',
      end_date: '2026-03-31',
    });

    expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          student_id: STUDENT_ID,
          summary_date: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-03-31'),
          },
        }),
      }),
    );
  });

  it('should not add summary_date filter when no dates provided', async () => {
    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);

    await service.findForStudent(TENANT_ID, STUDENT_ID, {});

    const callArgs = mockPrisma.dailyAttendanceSummary.findMany.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const where = callArgs.where as Record<string, unknown>;
    expect(where['summary_date']).toBeUndefined();
  });
});
