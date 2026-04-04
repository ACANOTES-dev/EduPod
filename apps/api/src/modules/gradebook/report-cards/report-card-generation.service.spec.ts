/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';

const mockRlsTx = {
  reportCard: {
    create: jest.fn().mockResolvedValue({ id: 'rc-1', status: 'draft' }),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import type { PrismaService } from '../../prisma/prisma.service';

import { ReportCardGenerationService } from './report-card-generation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERIOD_ID = 'period-1';
const CLASS_ID = 'class-1';
const STUDENT_ID = 'student-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    academicPeriod: { findFirst: jest.fn() },
    student: { findMany: jest.fn() },
    tenant: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    dailyAttendanceSummary: { groupBy: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    reportCard: { findMany: jest.fn() },
  };
}

const basePeriod = {
  id: PERIOD_ID,
  name: 'Term 1',
  start_date: new Date('2026-01-01'),
  end_date: new Date('2026-03-31'),
  academic_year: { id: 'ay-1', name: '2025-2026' },
};

const baseStudent = {
  id: STUDENT_ID,
  first_name: 'Ali',
  last_name: 'Hassan',
  student_number: 'STU001',
  year_group: { id: 'yg-1', name: 'Year 5' },
  homeroom_class: { id: CLASS_ID, name: '5A' },
  household: {
    id: 'h-1',
    billing_parent: {
      id: 'p-1',
      user: { preferred_locale: 'en' },
    },
  },
};

// ─── generate Tests ──────────────────────────────────────────────────────────

describe('ReportCardGenerationService — generate', () => {
  let service: ReportCardGenerationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });

    service = new ReportCardGenerationService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when period not found', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

    await expect(service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when some students not found', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.student.findMany.mockResolvedValue([]); // no students found

    await expect(
      service.generate(TENANT_ID, [STUDENT_ID, 'missing-id'], PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should generate a draft report card for a student', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.student.findMany.mockResolvedValue([baseStudent]);
    mockPrisma.tenant.findFirst.mockResolvedValue({ default_locale: 'en' });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        subject_id: 's1',
        class_id: CLASS_ID,
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
      },
    ]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

    const result = await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    expect(result.data).toHaveLength(1);
    expect(mockRlsTx.reportCard.create).toHaveBeenCalledTimes(1);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.status).toBe('draft');
    expect(createCall?.data?.student_id).toBe(STUDENT_ID);
  });

  it('should include attendance summary when data exists', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.student.findMany.mockResolvedValue([baseStudent]);
    mockPrisma.tenant.findFirst.mockResolvedValue({ default_locale: 'en' });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
      { derived_status: 'present', _count: { id: 45 } },
      { derived_status: 'absent', _count: { id: 3 } },
      { derived_status: 'late', _count: { id: 2 } },
    ]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const attendance = payload?.attendance_summary as Record<string, number>;

    expect(attendance?.total_days).toBe(50);
    expect(attendance?.present_days).toBe(47); // present + late
    expect(attendance?.absent_days).toBe(3);
    expect(attendance?.late_days).toBe(2);
  });

  it('should use billing parent locale for template_locale', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    const arStudent = {
      ...baseStudent,
      household: {
        id: 'h-1',
        billing_parent: {
          id: 'p-1',
          user: { preferred_locale: 'ar' },
        },
      },
    };
    mockPrisma.student.findMany.mockResolvedValue([arStudent]);
    mockPrisma.tenant.findFirst.mockResolvedValue({ default_locale: 'en' });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.template_locale).toBe('ar');
  });
});

// ─── buildBatchSnapshots Tests ───────────────────────────────────────────────

describe('ReportCardGenerationService — buildBatchSnapshots', () => {
  let service: ReportCardGenerationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();

    service = new ReportCardGenerationService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when period not found', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

    await expect(service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty array when no enrolments', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toEqual([]);
  });

  it('should build snapshot payloads for enrolled students', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      {
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
          year_group: { name: 'Year 5' },
          homeroom_class: { name: '5A' },
        },
      },
    ]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.studentId).toBe(STUDENT_ID);
    expect(result[0]?.studentName).toBe('Ali Hassan');
  });
});

// ─── generateBulkDrafts Tests ────────────────────────────────────────────────

describe('ReportCardGenerationService — generateBulkDrafts', () => {
  let service: ReportCardGenerationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });

    service = new ReportCardGenerationService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty when no enrolments', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.data).toEqual([]);
    expect(result.generated).toBe(0);
  });

  it('should skip students who already have report cards', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { student_id: STUDENT_ID },
      { student_id: 'student-2' },
    ]);
    mockPrisma.reportCard.findMany.mockResolvedValue([
      { student_id: STUDENT_ID }, // already has a report card
    ]);

    // Mock for the generate call for student-2
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.student.findMany.mockResolvedValue([
      {
        id: 'student-2',
        first_name: 'Sara',
        last_name: 'Ahmed',
        student_number: 'STU002',
        year_group: { id: 'yg-1', name: 'Year 5' },
        homeroom_class: { id: CLASS_ID, name: '5A' },
        household: null,
      },
    ]);
    mockPrisma.tenant.findFirst.mockResolvedValue({ default_locale: 'en' });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(1);
  });

  it('should return skipped=all when all students already have report cards', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
    mockPrisma.reportCard.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.data).toEqual([]);
  });
});
