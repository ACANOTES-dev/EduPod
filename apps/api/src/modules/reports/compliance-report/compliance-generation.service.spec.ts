import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ComplianceGenerationService } from './compliance-generation.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

const FIXTURE_ACADEMIC_YEAR = {
  id: ACADEMIC_YEAR_ID,
  name: '2026–2027',
  start_date: new Date('2026-09-01'),
  end_date: new Date('2027-06-30'),
};

const FIXTURE_TENANT = {
  id: TENANT_ID,
  name: 'Nurul Huda Q School',
};

// ─── Mock tx client ──────────────────────────────────────────────────────────

const mockTx = {
  tenant: { findFirst: jest.fn() },
  academicYear: { findFirst: jest.fn() },
  complianceReportGeneration: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  student: { count: jest.fn() },
  staffProfile: { count: jest.fn() },
  attendanceRecord: { groupBy: jest.fn() },
  attendanceSession: { findMany: jest.fn() },
  behaviourExclusionCase: { count: jest.fn() },
  safeguardingConcern: { count: jest.fn() },
  criticalIncident: { count: jest.fn() },
  senSupportPlan: { findMany: jest.fn() },
  staffVettingRecord: { findMany: jest.fn() },
  staffAttendanceRecord: { groupBy: jest.fn() },
  payment: { aggregate: jest.fn() },
  invoice: { aggregate: jest.fn() },
  teacherAbsence: { count: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

const FIXED_NOW = new Date('2026-10-01T12:00:00Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

function resetMocks(): void {
  Object.values(mockTx).forEach((model) => {
    Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
  });

  mockTx.tenant.findFirst.mockResolvedValue(FIXTURE_TENANT);
  mockTx.academicYear.findFirst.mockResolvedValue(FIXTURE_ACADEMIC_YEAR);

  mockTx.complianceReportGeneration.create.mockResolvedValue({
    id: 'gen-id-0001',
    created_at: FIXED_NOW,
  });
  mockTx.complianceReportGeneration.findMany.mockResolvedValue([]);
  mockTx.complianceReportGeneration.count.mockResolvedValue(0);

  mockTx.student.count.mockResolvedValue(120);
  mockTx.staffProfile.count.mockResolvedValue(15);

  mockTx.attendanceRecord.groupBy.mockResolvedValue([
    { status: 'present', _count: { _all: 900 } },
    { status: 'absent_unexcused', _count: { _all: 100 } },
  ]);
  mockTx.attendanceSession.findMany.mockResolvedValue([
    { session_date: new Date('2026-09-01') },
    { session_date: new Date('2026-09-02') },
  ]);

  mockTx.behaviourExclusionCase.count.mockResolvedValue(3);
  mockTx.safeguardingConcern.count.mockResolvedValue(7);
  mockTx.criticalIncident.count.mockResolvedValue(1);

  mockTx.senSupportPlan.findMany.mockResolvedValue([
    { sen_profile_id: 'sp-1' },
    { sen_profile_id: 'sp-2' },
  ]);

  mockTx.staffVettingRecord.findMany.mockResolvedValue([{ user_id: 'u-1' }, { user_id: 'u-2' }]);

  mockTx.staffAttendanceRecord.groupBy.mockResolvedValue([
    { status: 'present', _count: { _all: 400 } },
    { status: 'sick_leave', _count: { _all: 25 } },
  ]);

  mockTx.payment.aggregate.mockResolvedValue({ _sum: { amount: 25000 } });
  mockTx.invoice.aggregate.mockResolvedValue({
    _sum: { balance_amount: 12000, write_off_amount: 1500 },
  });

  mockTx.teacherAbsence.count.mockResolvedValue(4);
}

describe('ComplianceGenerationService — generate', () => {
  let service: ComplianceGenerationService;

  beforeEach(async () => {
    resetMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ComplianceGenerationService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = moduleRef.get(ComplianceGenerationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns every catalogue field when no subset requested', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
    });

    expect(result.fields).toHaveLength(19);
    expect(result.fields.every((f) => typeof f.key === 'string')).toBe(true);
    expect(result.meta.catalogue_version).toBe('v1');
    expect(result.meta.generated_by_user_id).toBe(USER_ID);
    expect(result.tenant.id).toBe(TENANT_ID);
  });

  it('includes only the requested fields when subset provided', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['student_headcount', 'staff_headcount'],
    });

    expect(result.fields.map((f) => f.key)).toEqual(['student_headcount', 'staff_headcount']);
  });

  it('throws NotFoundException when academic year is missing', async () => {
    mockTx.academicYear.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.generate(TENANT_ID, USER_ID, { academic_year_id: ACADEMIC_YEAR_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when tenant is missing', async () => {
    mockTx.tenant.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.generate(TENANT_ID, USER_ID, { academic_year_id: ACADEMIC_YEAR_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when an unknown field key is supplied', async () => {
    await expect(
      service.generate(TENANT_ID, USER_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        fields: ['totally_fake_key' as unknown as 'student_headcount'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists an audit row to compliance_report_generations', async () => {
    await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['student_headcount'],
    });

    expect(mockTx.complianceReportGeneration.create).toHaveBeenCalledTimes(1);
    const callArgs = mockTx.complianceReportGeneration.create.mock.calls[0]![0] as {
      data: {
        tenant_id: string;
        academic_year_id: string;
        generated_by: string;
        catalogue_version: string;
      };
    };
    expect(callArgs.data.tenant_id).toBe(TENANT_ID);
    expect(callArgs.data.academic_year_id).toBe(ACADEMIC_YEAR_ID);
    expect(callArgs.data.generated_by).toBe(USER_ID);
    expect(callArgs.data.catalogue_version).toBe('v1');
  });

  it('honest gap: qualified_teachers_percent returns has_gap=true with stable reason', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['qualified_teachers_percent'],
    });

    const field = result.fields[0]!;
    expect(field.has_gap).toBe(true);
    expect(field.gap_reason).toBe('qualification_field_not_yet_collected');
    expect(field.value).toBeNull();
  });

  it('honest gap: instruction_hours_held returns has_gap=true with stable reason', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['instruction_hours_held'],
    });

    const field = result.fields[0]!;
    expect(field.has_gap).toBe(true);
    expect(field.gap_reason).toBe('session_duration_field_not_yet_collected');
  });

  it('honest gap: attendance_rate_annual returns has_gap=true when no records exist', async () => {
    mockTx.attendanceRecord.groupBy.mockResolvedValueOnce([]);

    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['attendance_rate_annual'],
    });

    const field = result.fields[0]!;
    expect(field.has_gap).toBe(true);
    expect(field.gap_reason).toBe('no_attendance_records_in_academic_year');
    expect(field.value).toBeNull();
  });

  it('honest computation: attendance_rate_annual returns 90% for 900/1000', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['attendance_rate_annual'],
    });

    expect(result.fields[0]!.value).toBe(90);
    expect(result.fields[0]!.has_gap).toBe(false);
  });

  it('student_headcount reflects the active-students count', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['student_headcount'],
    });

    expect(result.fields[0]!.value).toBe(120);
  });

  it('pupil_teacher_ratio declares a gap when no teachers exist', async () => {
    mockTx.staffProfile.count.mockResolvedValue(0);

    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['pupil_teacher_ratio'],
    });

    expect(result.fields[0]!.has_gap).toBe(true);
    expect(result.fields[0]!.gap_reason).toBe('no_active_teachers_to_divide_by');
  });

  it('vetting_current_percent declares a gap when there are no active staff', async () => {
    mockTx.staffProfile.count.mockResolvedValue(0);

    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['vetting_current_percent'],
    });

    expect(result.fields[0]!.has_gap).toBe(true);
    expect(result.fields[0]!.gap_reason).toBe('no_active_staff');
  });

  it('degrades a rejected aggregator to has_gap: aggregator_error', async () => {
    mockTx.behaviourExclusionCase.count.mockRejectedValueOnce(new Error('connection dropped'));

    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['exclusions_this_year'],
    });

    const field = result.fields[0]!;
    expect(field.has_gap).toBe(true);
    expect(field.gap_reason).toBe('aggregator_error');
    expect(field.value).toBeNull();
  });

  it('includes source and label_key on every field from the catalogue', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      fields: ['student_headcount'],
    });

    const field = result.fields[0]!;
    expect(field.label_key).toBe('reports.compliance.student_headcount');
    expect(field.source.length).toBeGreaterThan(0);
  });
});

describe('ComplianceGenerationService — history', () => {
  let service: ComplianceGenerationService;

  beforeEach(async () => {
    resetMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ComplianceGenerationService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = moduleRef.get(ComplianceGenerationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('paginates with default page=1 pageSize=20', async () => {
    mockTx.complianceReportGeneration.findMany.mockResolvedValue([
      {
        id: 'g1',
        academic_year_id: ACADEMIC_YEAR_ID,
        generated_by: USER_ID,
        catalogue_version: 'v1',
        created_at: FIXED_NOW,
        fields_json: [{ key: 'student_headcount', has_gap: false }],
      },
    ]);
    mockTx.complianceReportGeneration.count.mockResolvedValue(1);

    const result = await service.history(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.field_count).toBe(1);
    expect(result.data[0]!.gap_count).toBe(0);
  });

  it('filters by academic_year_id when supplied', async () => {
    await service.history(TENANT_ID, {
      page: 1,
      pageSize: 20,
      academic_year_id: ACADEMIC_YEAR_ID,
    });

    const whereArg = mockTx.complianceReportGeneration.findMany.mock.calls[0]![0] as {
      where: { academic_year_id?: string };
    };
    expect(whereArg.where.academic_year_id).toBe(ACADEMIC_YEAR_ID);
  });

  it('counts gaps from the persisted fields_json array', async () => {
    mockTx.complianceReportGeneration.findMany.mockResolvedValue([
      {
        id: 'g1',
        academic_year_id: ACADEMIC_YEAR_ID,
        generated_by: USER_ID,
        catalogue_version: 'v1',
        created_at: FIXED_NOW,
        fields_json: [
          { key: 'student_headcount', has_gap: false },
          { key: 'instruction_hours_held', has_gap: true },
          { key: 'qualified_teachers_percent', has_gap: true },
        ],
      },
    ]);
    mockTx.complianceReportGeneration.count.mockResolvedValue(1);

    const result = await service.history(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]!.field_count).toBe(3);
    expect(result.data[0]!.gap_count).toBe(2);
  });

  it('returns zero counts when fields_json is not an array (defensive read)', async () => {
    mockTx.complianceReportGeneration.findMany.mockResolvedValue([
      {
        id: 'g1',
        academic_year_id: ACADEMIC_YEAR_ID,
        generated_by: USER_ID,
        catalogue_version: 'v1',
        created_at: FIXED_NOW,
        fields_json: 'corrupted-string-not-array',
      },
    ]);
    mockTx.complianceReportGeneration.count.mockResolvedValue(1);

    const result = await service.history(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]!.field_count).toBe(0);
    expect(result.data[0]!.gap_count).toBe(0);
  });

  it('honours pagination offsets', async () => {
    await service.history(TENANT_ID, { page: 3, pageSize: 10 });

    const findManyArgs = mockTx.complianceReportGeneration.findMany.mock.calls[0]![0] as {
      skip: number;
      take: number;
    };
    expect(findManyArgs.skip).toBe(20);
    expect(findManyArgs.take).toBe(10);
  });
});
