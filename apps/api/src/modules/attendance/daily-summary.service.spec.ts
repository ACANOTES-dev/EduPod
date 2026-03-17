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
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

function makeRecord(
  status: string,
  sessionId = 'session-1',
  classId = 'class-1',
) {
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
      providers: [
        DailySummaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
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
});
