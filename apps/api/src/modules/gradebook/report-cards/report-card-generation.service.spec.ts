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

// ─── generate — additional branch coverage ──────────────────────────────────

describe('ReportCardGenerationService — generate additional branches', () => {
  afterEach(() => jest.clearAllMocks());

  it('should use tenant default locale when billing parent locale is null', async () => {
    const {
      service,
      prisma,
      academic,
      student: studentFacade,
      attendance,
      tenant,
    } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    const studentNoLocale = {
      ...baseStudent,
      household: {
        id: 'h-1',
        billing_parent: {
          id: 'p-1',
          user: { preferred_locale: null },
        },
      },
    };
    studentFacade.findManyGeneric.mockResolvedValue([studentNoLocale]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);
    tenant.findDefaultLocale.mockResolvedValue('ar');

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.template_locale).toBe('ar');
  });

  it('should use tenant default locale when household is null', async () => {
    const {
      service,
      prisma,
      academic,
      student: studentFacade,
      attendance,
      tenant,
    } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    const studentNoHousehold = {
      ...baseStudent,
      household: null,
    };
    studentFacade.findManyGeneric.mockResolvedValue([studentNoHousehold]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);
    tenant.findDefaultLocale.mockResolvedValue('en');

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.template_locale).toBe('en');
  });

  it('should use tenant default locale when billing_parent is null', async () => {
    const {
      service,
      prisma,
      academic,
      student: studentFacade,
      attendance,
      tenant,
    } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    const studentNoBillingParent = {
      ...baseStudent,
      household: { id: 'h-1', billing_parent: null },
    };
    studentFacade.findManyGeneric.mockResolvedValue([studentNoBillingParent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);
    tenant.findDefaultLocale.mockResolvedValue('en');

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    expect(createCall?.data?.template_locale).toBe('en');
  });

  it('should set empty string for year_group when null', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    const studentNoYearGroup = {
      ...baseStudent,
      year_group: null,
      homeroom_class: null,
    };
    studentFacade.findManyGeneric.mockResolvedValue([studentNoYearGroup]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const student = payload?.student as Record<string, unknown>;
    expect(student?.year_group).toBe('');
    expect(student?.class_homeroom).toBeNull();
  });

  it('should set attendance_summary to undefined when totalDays is 0', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([baseStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    expect(payload?.attendance_summary).toBeUndefined();
  });

  it('should include partially_absent in absent_days count', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([baseStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([
      { derived_status: 'present', _count: { _all: 30 } },
      { derived_status: 'absent', _count: { _all: 2 } },
      { derived_status: 'partially_absent', _count: { _all: 3 } },
      { derived_status: 'late', _count: { _all: 5 } },
    ]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const summary = payload?.attendance_summary as Record<string, number>;
    expect(summary?.absent_days).toBe(5); // 2 + 3
    expect(summary?.present_days).toBe(35); // 30 + 5
    expect(summary?.late_days).toBe(5);
    expect(summary?.total_days).toBe(40);
  });

  it('should map assessment grades and handle missing grades', async () => {
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
    prisma.assessment.findMany.mockResolvedValue([
      {
        subject_id: 's1',
        class_id: CLASS_ID,
        title: 'Quiz 1',
        max_score: 100,
        category: { name: 'Quizzes' },
        grades: [{ raw_score: 90, is_missing: false }],
      },
      {
        subject_id: 's1',
        class_id: CLASS_ID,
        title: 'Quiz 2',
        max_score: 100,
        category: { name: 'Quizzes' },
        grades: [], // no grade for this student
      },
    ]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const subjects = payload?.subjects as Array<{
      assessments: Array<{ raw_score: number | null; is_missing: boolean }>;
    }>;
    expect(subjects).toHaveLength(1);
    expect(subjects[0]!.assessments).toHaveLength(2);
    // First assessment has a grade
    expect(subjects[0]!.assessments[0]!.raw_score).toBe(90);
    expect(subjects[0]!.assessments[0]!.is_missing).toBe(false);
    // Second assessment has no grade => is_missing defaults to true
    expect(subjects[0]!.assessments[1]!.is_missing).toBe(true);
  });

  it('should use overridden_value as display_value when present', async () => {
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
        overridden_value: 'A+',
        subject: { id: 's1', name: 'Math', code: null },
      },
    ]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const subjects = payload?.subjects as Array<{
      display_value: string;
      subject_code: string | null;
      overridden_value: string | null;
    }>;
    expect(subjects[0]!.display_value).toBe('A+');
    expect(subjects[0]!.overridden_value).toBe('A+');
    expect(subjects[0]!.subject_code).toBeNull();
  });

  it('should set student_number to null when not present', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    const studentNoNumber = {
      ...baseStudent,
      student_number: null,
    };
    studentFacade.findManyGeneric.mockResolvedValue([studentNoNumber]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    const createCall = mockRlsTx.reportCard.create.mock.calls[0]?.[0];
    const payload = createCall?.data?.snapshot_payload_json as Record<string, unknown>;
    const student = payload?.student as Record<string, unknown>;
    expect(student?.student_number).toBeNull();
  });

  it('should skip assessments when subjectIds is empty', async () => {
    const { service, prisma, academic, student: studentFacade, attendance } = buildService();
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ id: 'rc-1', status: 'draft' });
    academic.findPeriodById.mockResolvedValue(basePeriod);
    studentFacade.findManyGeneric.mockResolvedValue([baseStudent]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]); // no snapshots => empty subjectIds
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    await service.generate(TENANT_ID, [STUDENT_ID], PERIOD_ID);

    // assessment.findMany should NOT be called because subjectIds.length === 0
    expect(prisma.assessment.findMany).not.toHaveBeenCalled();
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

// ─── buildBatchSnapshots — additional branch coverage ─────────────────────────

describe('ReportCardGenerationService — buildBatchSnapshots additional branches', () => {
  afterEach(() => jest.clearAllMocks());

  it('should build payloads with attendance data when totalDays > 0', async () => {
    const { service, prisma, academic, classes, attendance } = buildService();
    academic.findPeriodById.mockResolvedValue(basePeriod);
    classes.findEnrolmentsGeneric.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: null,
          year_group: null,
          homeroom_class: null,
        },
      },
    ]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 90,
        display_value: 'A',
        overridden_value: 'A+',
        subject: { id: 's1', name: 'Math', code: 'MATH' },
      },
    ]);
    attendance.groupSummariesByStatus.mockResolvedValue([
      { derived_status: 'present', _count: { _all: 20 } },
      { derived_status: 'late', _count: { _all: 1 } },
      { derived_status: 'absent', _count: { _all: 2 } },
      { derived_status: 'partially_absent', _count: { _all: 1 } },
    ]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    const payload = result[0]!.payload as Record<string, unknown>;
    const student = payload.student as Record<string, unknown>;
    expect(student.student_number).toBeNull();
    expect(student.year_group).toBe('');
    expect(student.class_homeroom).toBeNull();

    const subjects = payload.subjects as Array<{
      overridden_value: string | null;
      display_value: string;
    }>;
    expect(subjects[0]!.overridden_value).toBe('A+');
    expect(subjects[0]!.display_value).toBe('A+');

    const attendanceSummary = payload.attendance_summary as Record<string, number>;
    expect(attendanceSummary.total_days).toBe(24);
    expect(attendanceSummary.present_days).toBe(21); // 20 + 1
    expect(attendanceSummary.absent_days).toBe(3); // 2 + 1
    expect(attendanceSummary.late_days).toBe(1);
  });

  it('should set attendance_summary to undefined when no attendance data', async () => {
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

    const payload = result[0]!.payload as Record<string, unknown>;
    expect(payload.attendance_summary).toBeUndefined();
  });

  it('should handle multiple students with different snapshot distributions', async () => {
    const { service, prisma, academic, classes, attendance } = buildService();
    academic.findPeriodById.mockResolvedValue(basePeriod);
    classes.findEnrolmentsGeneric.mockResolvedValue([
      {
        student_id: 'student-1',
        student: {
          id: 'student-1',
          first_name: 'Ali',
          last_name: 'A',
          student_number: 'S1',
          year_group: { name: 'Y5' },
          homeroom_class: { name: '5A' },
        },
      },
      {
        student_id: 'student-2',
        student: {
          id: 'student-2',
          first_name: 'Sara',
          last_name: 'B',
          student_number: 'S2',
          year_group: { name: 'Y5' },
          homeroom_class: { name: '5A' },
        },
      },
    ]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: 'student-1',
        subject_id: 's1',
        computed_value: 80,
        display_value: 'B',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: null },
      },
    ]);
    attendance.groupSummariesByStatus.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toHaveLength(2);
    // student-1 has one subject
    const s1Payload = result[0]!.payload as Record<string, unknown>;
    const s1Subjects = s1Payload.subjects as Array<unknown>;
    expect(s1Subjects).toHaveLength(1);
    // student-2 has no subjects (no snapshots)
    const s2Payload = result[1]!.payload as Record<string, unknown>;
    const s2Subjects = s2Payload.subjects as Array<unknown>;
    expect(s2Subjects).toHaveLength(0);
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

// ═══════════════════════════════════════════════════════════════════════════
// Report Cards Redesign (impl 04) — new flow tests
// ═══════════════════════════════════════════════════════════════════════════

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import type { ReportCardTemplateService } from './report-card-template.service';
import type { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';

const TENANT_ID_V2 = '11111111-1111-4111-8111-111111111111';
const PERIOD_ID_V2 = '22222222-2222-4222-8222-222222222222';
const CLASS_ID_V2 = '33333333-3333-4333-8333-333333333333';
const STUDENT_A = '44444444-4444-4444-8444-444444444444';
const STUDENT_B = '55555555-5555-4555-8555-555555555555';
const YEAR_GROUP_ID = '66666666-6666-4666-8666-666666666666';
const TEMPLATE_ID = '77777777-7777-4777-8777-777777777777';

function buildV2Prisma() {
  return {
    // legacy (impl 01 code paths still reference these)
    periodGradeSnapshot: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    reportCard: { findMany: jest.fn() },
    // impl 04 gradebook-owned models
    reportCardSubjectComment: { findMany: jest.fn() },
    reportCardOverallComment: { findMany: jest.fn() },
    reportCardBatchJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function buildV2ClassesFacade() {
  return {
    findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
    findClassEnrolmentsWithStudents: jest.fn().mockResolvedValue([]),
  };
}

function buildV2StudentFacade() {
  return {
    findManyGeneric: jest.fn().mockResolvedValue([]),
  };
}

function buildV2TemplateService(overrides?: Partial<ReportCardTemplateService>) {
  return {
    resolveForGeneration: jest.fn().mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID_V2,
      locale: 'en',
      content_scope: 'grades_only',
      is_default: true,
    }),
    ...overrides,
  } as unknown as ReportCardTemplateService;
}

function buildV2SettingsService(
  payload?: Partial<{
    require_finalised_comments: boolean;
    allow_admin_force_generate: boolean;
    default_personal_info_fields: string[];
  }>,
) {
  return {
    getPayload: jest.fn().mockResolvedValue({
      matrix_display_mode: 'grade',
      show_top_rank_badge: false,
      default_personal_info_fields: payload?.default_personal_info_fields ?? [],
      require_finalised_comments: payload?.require_finalised_comments ?? true,
      allow_admin_force_generate: payload?.allow_admin_force_generate ?? true,
      principal_signature_storage_key: null,
      principal_name: null,
      grade_threshold_set_id: null,
      default_template_id: null,
    }),
  } as unknown as ReportCardTenantSettingsService;
}

function buildV2Queue() {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

function buildV2Service(opts?: {
  prisma?: ReturnType<typeof buildV2Prisma>;
  template?: ReturnType<typeof buildV2TemplateService>;
  settings?: ReturnType<typeof buildV2SettingsService>;
  queue?: ReturnType<typeof buildV2Queue>;
  academic?: ReturnType<typeof buildMockAcademicFacade>;
  classes?: ReturnType<typeof buildV2ClassesFacade>;
  student?: ReturnType<typeof buildV2StudentFacade>;
}) {
  const prisma = opts?.prisma ?? buildV2Prisma();
  const academic = opts?.academic ?? buildMockAcademicFacade();
  const classes = opts?.classes ?? buildV2ClassesFacade();
  const student = opts?.student ?? buildV2StudentFacade();
  const template = opts?.template ?? buildV2TemplateService();
  const settings = opts?.settings ?? buildV2SettingsService();
  const queue = opts?.queue ?? buildV2Queue();

  const service = new ReportCardGenerationService(
    prisma as unknown as PrismaService,
    academic as unknown as AcademicReadFacade,
    student as unknown as StudentReadFacade,
    buildMockTenantFacade() as unknown as TenantReadFacade,
    buildMockAttendanceFacade() as unknown as AttendanceReadFacade,
    classes as unknown as ClassesReadFacade,
    template,
    settings,
    queue as unknown as import('bullmq').Queue,
  );

  return { service, prisma, template, settings, queue, academic, classes, student };
}

describe('ReportCardGenerationService — resolveScope', () => {
  afterEach(() => jest.clearAllMocks());

  it('expands class mode to deduped student IDs', async () => {
    const { service, classes } = buildV2Service();
    classes.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_A, class_id: CLASS_ID_V2 },
      { student_id: STUDENT_A, class_id: CLASS_ID_V2 }, // dup
      { student_id: STUDENT_B, class_id: CLASS_ID_V2 },
    ]);

    const result = await service.resolveScope(TENANT_ID_V2, {
      mode: 'class',
      class_ids: [CLASS_ID_V2],
    });

    expect(result.studentIds).toEqual([STUDENT_A, STUDENT_B]);
    expect(result.classIds).toEqual([CLASS_ID_V2]);
  });

  it('expands year_group mode via enrolments with nested class filter', async () => {
    const { service, classes } = buildV2Service();
    classes.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_A, class_id: CLASS_ID_V2 },
    ]);

    const result = await service.resolveScope(TENANT_ID_V2, {
      mode: 'year_group',
      year_group_ids: [YEAR_GROUP_ID],
    });

    expect(result.studentIds).toEqual([STUDENT_A]);
    expect(result.classIds).toEqual([CLASS_ID_V2]);
  });

  it('returns empty when year_group has no enrolments', async () => {
    const { service, classes } = buildV2Service();
    classes.findEnrolmentsGeneric.mockResolvedValue([]);

    const result = await service.resolveScope(TENANT_ID_V2, {
      mode: 'year_group',
      year_group_ids: [YEAR_GROUP_ID],
    });

    expect(result.studentIds).toEqual([]);
    expect(result.classIds).toEqual([]);
  });

  it('expands individual mode and verifies tenant ownership', async () => {
    const { service, student } = buildV2Service();
    student.findManyGeneric.mockResolvedValue([{ id: STUDENT_A, class_homeroom_id: CLASS_ID_V2 }]);

    const result = await service.resolveScope(TENANT_ID_V2, {
      mode: 'individual',
      student_ids: [STUDENT_A],
    });

    expect(result.studentIds).toEqual([STUDENT_A]);
    expect(result.classIds).toEqual([CLASS_ID_V2]);
  });

  it('throws STUDENTS_NOT_FOUND when individual scope contains an unknown id', async () => {
    const { service, student } = buildV2Service();
    student.findManyGeneric.mockResolvedValue([]);

    await expect(
      service.resolveScope(TENANT_ID_V2, {
        mode: 'individual',
        student_ids: [STUDENT_A],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ReportCardGenerationService — dryRunCommentGate', () => {
  afterEach(() => jest.clearAllMocks());

  function mockCommentGateData(
    prisma: ReturnType<typeof buildV2Prisma>,
    classes: ReturnType<typeof buildV2ClassesFacade>,
    studentFacade: ReturnType<typeof buildV2StudentFacade>,
  ) {
    classes.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_A, class_id: CLASS_ID_V2 },
      { student_id: STUDENT_B, class_id: CLASS_ID_V2 },
    ]);
    studentFacade.findManyGeneric.mockResolvedValue([
      {
        id: STUDENT_A,
        first_name: 'Ali',
        last_name: 'Hassan',
        preferred_second_language: 'ar',
      },
      {
        id: STUDENT_B,
        first_name: 'Sara',
        last_name: 'Khan',
        preferred_second_language: null,
      },
    ]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_A,
        subject_id: 'subj-1',
        subject: { id: 'subj-1', name: 'Math' },
      },
      {
        student_id: STUDENT_B,
        subject_id: 'subj-1',
        subject: { id: 'subj-1', name: 'Math' },
      },
    ]);
  }

  it('flags would_block when strict mode + missing comments', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const { service, prisma, classes, student } = buildV2Service({ academic });
    mockCommentGateData(prisma, classes, student);
    prisma.reportCardSubjectComment.findMany.mockResolvedValue([]);
    prisma.reportCardOverallComment.findMany.mockResolvedValue([]);

    const result = await service.dryRunCommentGate(TENANT_ID_V2, {
      scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
      academic_period_id: PERIOD_ID_V2,
      content_scope: 'grades_only',
    });

    expect(result.students_total).toBe(2);
    expect(result.missing_subject_comments.length).toBe(2);
    expect(result.missing_overall_comments.length).toBe(2);
    expect(result.would_block).toBe(true);
    // One student requested 'ar' AND the mock template resolver returns a non-null ar template
    expect(result.languages_preview.en).toBe(2);
    expect(result.languages_preview.ar).toBe(1);
  });

  it('does not block when strict mode is off', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const settings = buildV2SettingsService({ require_finalised_comments: false });
    const { service, prisma, classes, student } = buildV2Service({ academic, settings });
    mockCommentGateData(prisma, classes, student);
    prisma.reportCardSubjectComment.findMany.mockResolvedValue([]);
    prisma.reportCardOverallComment.findMany.mockResolvedValue([]);

    const result = await service.dryRunCommentGate(TENANT_ID_V2, {
      scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
      academic_period_id: PERIOD_ID_V2,
      content_scope: 'grades_only',
    });

    expect(result.would_block).toBe(false);
  });

  it('separates missing from unfinalised comments', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const { service, prisma, classes, student } = buildV2Service({ academic });
    mockCommentGateData(prisma, classes, student);
    prisma.reportCardSubjectComment.findMany.mockResolvedValue([
      {
        student_id: STUDENT_A,
        subject_id: 'subj-1',
        finalised_at: new Date(),
        comment_text: 'ok',
      },
      {
        student_id: STUDENT_B,
        subject_id: 'subj-1',
        finalised_at: null,
        comment_text: 'draft',
      },
    ]);
    prisma.reportCardOverallComment.findMany.mockResolvedValue([
      { student_id: STUDENT_A, finalised_at: new Date(), comment_text: 'ok' },
      { student_id: STUDENT_B, finalised_at: new Date(), comment_text: 'ok' },
    ]);

    const result = await service.dryRunCommentGate(TENANT_ID_V2, {
      scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
      academic_period_id: PERIOD_ID_V2,
      content_scope: 'grades_only',
    });

    expect(result.missing_subject_comments.length).toBe(0);
    expect(result.unfinalised_subject_comments.length).toBe(1);
    expect(result.unfinalised_subject_comments[0]?.student_id).toBe(STUDENT_B);
    expect(result.would_block).toBe(true); // unfinalised still blocks
  });

  it('throws SCOPE_EMPTY when scope resolves to zero students', async () => {
    const { service, classes } = buildV2Service();
    classes.findEnrolmentsGeneric.mockResolvedValue([]);

    await expect(
      service.dryRunCommentGate(TENANT_ID_V2, {
        scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
        academic_period_id: PERIOD_ID_V2,
        content_scope: 'grades_only',
      }),
    ).rejects.toThrow(/SCOPE_EMPTY|not resolve/);
  });
});

describe('ReportCardGenerationService — generateRun', () => {
  beforeEach(() => {
    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          reportCardBatchJob: {
            create: jest.fn().mockResolvedValue({ id: 'batch-job-1' }),
          },
        }),
      ),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function seedHappyPath(
    prisma: ReturnType<typeof buildV2Prisma>,
    classes: ReturnType<typeof buildV2ClassesFacade>,
    studentFacade: ReturnType<typeof buildV2StudentFacade>,
  ) {
    classes.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_A, class_id: CLASS_ID_V2 },
    ]);
    studentFacade.findManyGeneric.mockResolvedValue([
      {
        id: STUDENT_A,
        first_name: 'Ali',
        last_name: 'Hassan',
        preferred_second_language: null,
      },
    ]);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    prisma.reportCardSubjectComment.findMany.mockResolvedValue([]);
    prisma.reportCardOverallComment.findMany.mockResolvedValue([]);
  }

  it('throws SCOPE_EMPTY when no students resolve', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const { service, classes } = buildV2Service({ academic });
    classes.findEnrolmentsGeneric.mockResolvedValue([]);

    await expect(
      service.generateRun(TENANT_ID_V2, 'user-1', {
        scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
        academic_period_id: PERIOD_ID_V2,
        content_scope: 'grades_only',
        override_comment_gate: false,
      }),
    ).rejects.toThrow(/SCOPE_EMPTY|not resolve/);
  });

  it('throws COMMENT_GATE_BLOCKING when strict and no override', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const { service, prisma, classes, student } = buildV2Service({ academic });
    seedHappyPath(prisma, classes, student);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_A,
        subject_id: 'subj-1',
        subject: { id: 'subj-1', name: 'Math' },
      },
    ]);

    await expect(
      service.generateRun(TENANT_ID_V2, 'user-1', {
        scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
        academic_period_id: PERIOD_ID_V2,
        content_scope: 'grades_only',
        override_comment_gate: false,
      }),
    ).rejects.toThrow(/COMMENT_GATE_BLOCKING|Generation is blocked/);
  });

  it('creates a batch job and enqueues when override is set', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const { service, prisma, classes, student, queue } = buildV2Service({ academic });
    seedHappyPath(prisma, classes, student);

    const result = await service.generateRun(TENANT_ID_V2, 'user-1', {
      scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
      academic_period_id: PERIOD_ID_V2,
      content_scope: 'grades_only',
      override_comment_gate: true,
    });

    expect(result.batch_job_id).toBe('batch-job-1');
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [jobName, payload] = queue.add.mock.calls[0] ?? [];
    expect(jobName).toBe('report-cards:generate');
    expect(payload).toMatchObject({
      tenant_id: TENANT_ID_V2,
      batch_job_id: 'batch-job-1',
    });
  });

  it('rejects FORCE_GENERATE_DISABLED when tenant disables force', async () => {
    const academic = buildMockAcademicFacade();
    academic.findPeriodById.mockResolvedValue({ id: PERIOD_ID_V2 });
    const settings = buildV2SettingsService({
      require_finalised_comments: true,
      allow_admin_force_generate: false,
    });
    const { service, prisma, classes, student } = buildV2Service({ academic, settings });
    seedHappyPath(prisma, classes, student);
    prisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_A,
        subject_id: 'subj-1',
        subject: { id: 'subj-1', name: 'Math' },
      },
    ]);

    await expect(
      service.generateRun(TENANT_ID_V2, 'user-1', {
        scope: { mode: 'class', class_ids: [CLASS_ID_V2] },
        academic_period_id: PERIOD_ID_V2,
        content_scope: 'grades_only',
        override_comment_gate: true,
      }),
    ).rejects.toThrow(/FORCE_GENERATE_DISABLED|Force generate/);
  });
});

describe('ReportCardGenerationService — listRuns / getRun', () => {
  afterEach(() => jest.clearAllMocks());

  const rowFixture = {
    id: 'batch-1',
    tenant_id: TENANT_ID_V2,
    status: 'completed',
    class_id: CLASS_ID_V2,
    scope_type: 'class',
    scope_ids_json: [CLASS_ID_V2],
    academic_period_id: PERIOD_ID_V2,
    template_id: TEMPLATE_ID,
    personal_info_fields_json: ['full_name'],
    languages_requested: ['en', 'ar'],
    students_generated_count: 3,
    students_blocked_count: 0,
    total_count: 3,
    errors_json: [],
    requested_by_user_id: 'user-1',
    created_at: new Date('2026-04-09'),
    updated_at: new Date('2026-04-09'),
  };

  it('getRun returns the summary for an existing run', async () => {
    const { service, prisma } = buildV2Service();
    prisma.reportCardBatchJob.findFirst.mockResolvedValue(rowFixture);

    const result = await service.getRun(TENANT_ID_V2, 'batch-1');

    expect(result.id).toBe('batch-1');
    expect(result.scope_type).toBe('class');
    expect(result.languages_requested).toEqual(['en', 'ar']);
  });

  it('getRun throws GENERATION_RUN_NOT_FOUND when missing', async () => {
    const { service, prisma } = buildV2Service();
    prisma.reportCardBatchJob.findFirst.mockResolvedValue(null);

    await expect(service.getRun(TENANT_ID_V2, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('listRuns paginates by created_at desc', async () => {
    const { service, prisma } = buildV2Service();
    prisma.reportCardBatchJob.findMany.mockResolvedValue([rowFixture]);
    prisma.reportCardBatchJob.count.mockResolvedValue(1);

    const result = await service.listRuns(TENANT_ID_V2, { page: 1, pageSize: 20 });

    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(result.data).toHaveLength(1);
  });
});
