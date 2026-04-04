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

import type { AcademicReadFacade } from '../../academics/academic-read.facade';
import type { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import type { ClassesReadFacade } from '../../classes/classes-read.facade';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StudentReadFacade } from '../../students/student-read.facade';
import type { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { ReportCardGenerationService } from './report-card-generation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERIOD_ID = 'period-1';
const CLASS_ID = 'class-1';
const STUDENT_ID = 'student-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    periodGradeSnapshot: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    reportCard: { findMany: jest.fn() },
  };
}

function buildMockAcademicFacade() {
  return { findPeriodById: jest.fn().mockResolvedValue(null) };
}

function buildMockStudentFacade() {
  return { findManyGeneric: jest.fn().mockResolvedValue([]) };
}

function buildMockTenantFacade() {
  return { findDefaultLocale: jest.fn().mockResolvedValue('en') };
}

function buildMockAttendanceFacade() {
  return { groupSummariesByStatus: jest.fn().mockResolvedValue([]) };
}

function buildMockClassesFacade() {
  return {
    findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
    findClassEnrolmentsWithStudents: jest.fn().mockResolvedValue([]),
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

function buildService(overrides?: {
  prisma?: ReturnType<typeof buildMockPrisma>;
  academic?: ReturnType<typeof buildMockAcademicFacade>;
  student?: ReturnType<typeof buildMockStudentFacade>;
  tenant?: ReturnType<typeof buildMockTenantFacade>;
  attendance?: ReturnType<typeof buildMockAttendanceFacade>;
  classes?: ReturnType<typeof buildMockClassesFacade>;
}) {
  const prisma = overrides?.prisma ?? buildMockPrisma();
  const academic = overrides?.academic ?? buildMockAcademicFacade();
  const student = overrides?.student ?? buildMockStudentFacade();
  const tenant = overrides?.tenant ?? buildMockTenantFacade();
  const attendance = overrides?.attendance ?? buildMockAttendanceFacade();
  const classes = overrides?.classes ?? buildMockClassesFacade();

  const service = new ReportCardGenerationService(
    prisma as unknown as PrismaService,
    academic as unknown as AcademicReadFacade,
    student as unknown as StudentReadFacade,
    tenant as unknown as TenantReadFacade,
    attendance as unknown as AttendanceReadFacade,
    classes as unknown as ClassesReadFacade,
  );

  return { service, prisma, academic, student, tenant, attendance, classes };
}

// ─── generate Tests ──────────────────────────────────────────────────────────

describe('ReportCardGenerationService — generate', () => {
  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when period not found', async () => {
    const { service, academic } = buildService();
    academic.findPeriodById.mockResolvedValue(null);

    await expect(service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when some students not found', async () => {
    const { service, academic, student: studentFacade } = buildService();
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([]); // no students found

    await expect(
      service.generate(TENANT_ID, [STUDENT_ID, 'missing-id'], PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should generate a draft report card for a student', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([baseStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        subject_id: 's1',
        class_id: CLASS_ID,
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
      },
    ]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    const result = await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    expect(result.data).toHaveLength(1);
    expect(mockRlsTx.reportCard.create).toHaveBeenCalledTimes(1);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.status).toBe('draft');
    expect(createCall?.data?.student_id).toBe(STUDENT_ID);
  });

  it('should include attendance summary when data exists', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([baseStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([
      { derived_status: 'present', _count: { _all: 45 } },
      { derived_status: 'absent', _count: { _all: 3 } },
      { derived_status: 'late', _count: { _all: 2 } },
    ]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const attendanceSummary = payload?.attendance_summary as Record<string, number>;

    expect(attendanceSummary?.total_days).toBe(50);
    expect(attendanceSummary?.present_days).toBe(47); // present + late
    expect(attendanceSummary?.absent_days).toBe(3);
    expect(attendanceSummary?.late_days).toBe(2);
  });

  it('should use billing parent locale for template_locale', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
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
    studentFacade.findManyGeneric.mockResolvedValue([arStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.template_locale).toBe('ar');
  });
});

// ─── buildBatchSnapshots Tests ───────────────────────────────────────────────

describe('ReportCardGenerationService — buildBatchSnapshots', () => {
  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when period not found', async () => {
    const { service, academic } = buildService();
    academic.findPeriodById.mockResolvedValue(null);

    await expect(service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty array when no enrolments', async () => {
    const { service, academic, classes } = buildService();
    academic.findPeriodById.mockResolvedValue(basePeriod);
    classes.findEnrolmentsGeneric.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toEqual([]);
  });

  it('should build snapshot payloads for enrolled students', async () => {
    const { service, prisma, academic, classes, attendance } = buildService();
    academic.findPeriodById.mockResolvedValue(basePeriod);
    classes.findEnrolmentsGeneric.mockResolvedValue([
      {
        student_id: STUDENT_ID,
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
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.studentId).toBe(STUDENT_ID);
    expect(result[0]?.studentName).toBe('Ali Hassan');
  });
});

// ─── generateBulkDrafts Tests ────────────────────────────────────────────────

describe('ReportCardGenerationService — generateBulkDrafts', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return empty when no enrolments', async () => {
    const { service, classes } = buildService();
    classes.findEnrolmentsGeneric.mockResolvedValue([]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.data).toEqual([]);
    expect(result.generated).toBe(0);
  });

  it('should skip students who already have report cards', async () => {
    const {
      service,
      prisma,
      academic,
      student: studentFacade,
      attendance,
      classes,
    } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    classes.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_ID },
      { student_id: 'student-2' },
    ]);
    prisma.reportCard.findMany.mockResolvedValue([
      { student_id: STUDENT_ID }, // already has a report card
    ]);

    // Mock for the generate call for student-2
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([
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
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(1);
  });

  it('should return skipped=all when all students already have report cards', async () => {
    const { service, prisma, classes } = buildService();
    classes.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
    prisma.reportCard.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);

    const result = await service.generateBulkDrafts(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.data).toEqual([]);
  });
});
