import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffAnalyticsService } from './staff-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('StaffAnalyticsService', () => {
  let service: StaffAnalyticsService;
  let mockPrisma: {
    staffProfile: {
      groupBy: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    student: { count: jest.Mock };
    staffAttendanceRecord: { groupBy: jest.Mock };
    subject: { findMany: jest.Mock };
    class: { findMany: jest.Mock };
    classStaff: { count: jest.Mock };
    staffCompensation: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      staffProfile: {
        groupBy: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      student: { count: jest.fn() },
      staffAttendanceRecord: { groupBy: jest.fn() },
      subject: { findMany: jest.fn() },
      class: { findMany: jest.fn() },
      classStaff: { count: jest.fn() },
      staffCompensation: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StaffAnalyticsService>(StaffAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── headcountByDepartment ────────────────────────────────────────────────

  it('should return headcount grouped by department sorted descending', async () => {
    mockPrisma.staffProfile.groupBy
      .mockResolvedValueOnce([
        { department: 'Science', _count: 5 },
        { department: 'Maths', _count: 3 },
      ])
      .mockResolvedValueOnce([
        { department: 'Science', _count: 4 },
        { department: 'Maths', _count: 3 },
      ]);

    const result = await service.headcountByDepartment(TENANT_ID);

    expect(result).toHaveLength(2);
    expect(result[0]!.department).toBe('Science');
    expect(result[0]!.count).toBe(5);
    expect(result[0]!.active_count).toBe(4);
  });

  it('should exclude null department entries from headcountByDepartment', async () => {
    mockPrisma.staffProfile.groupBy
      .mockResolvedValueOnce([
        { department: null, _count: 2 },
        { department: 'Arts', _count: 1 },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.headcountByDepartment(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.department).toBe('Arts');
  });

  // ─── staffStudentRatio ────────────────────────────────────────────────────

  it('should return correct staff student ratio', async () => {
    mockPrisma.staffProfile.count.mockResolvedValue(10);
    mockPrisma.student.count.mockResolvedValue(200);

    const result = await service.staffStudentRatio(TENANT_ID);

    expect(result.active_staff).toBe(10);
    expect(result.active_students).toBe(200);
    expect(result.students_per_teacher).toBe(20);
    expect(result.ratio).toBe('1:20');
  });

  it('should return 0 students_per_teacher when no active staff', async () => {
    mockPrisma.staffProfile.count.mockResolvedValue(0);
    mockPrisma.student.count.mockResolvedValue(50);

    const result = await service.staffStudentRatio(TENANT_ID);

    expect(result.students_per_teacher).toBe(0);
    expect(result.ratio).toBe('1:0');
  });

  // ─── tenureDistribution ───────────────────────────────────────────────────

  it('should return 5 tenure buckets with percentage summing to 100', async () => {
    const now = new Date();
    // Create staff at different tenure levels
    const makeDate = (yearsAgo: number) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - yearsAgo);
      return d;
    };

    mockPrisma.staffProfile.findMany.mockResolvedValue([
      { created_at: makeDate(0) },  // < 1 year
      { created_at: makeDate(2) },  // 1-3 years
      { created_at: makeDate(4) },  // 3-5 years
      { created_at: makeDate(7) },  // 5-10 years
      { created_at: makeDate(12) }, // 10+ years
    ]);

    const result = await service.tenureDistribution(TENANT_ID);

    expect(result).toHaveLength(5);
    const totalCount = result.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(5);
    const totalPct = result.reduce((s, b) => s + b.percentage, 0);
    expect(Math.round(totalPct)).toBe(100);
  });

  // ─── staffAttendanceRate ──────────────────────────────────────────────────

  it('should compute attendance rate from groupBy status results', async () => {
    mockPrisma.staffAttendanceRecord.groupBy.mockResolvedValue([
      { status: 'present', _count: 80 },
      { status: 'absent', _count: 20 },
    ]);

    const result = await service.staffAttendanceRate(TENANT_ID);

    expect(result.total_records).toBe(100);
    expect(result.present_count).toBe(80);
    expect(result.absent_count).toBe(20);
    expect(result.attendance_rate).toBe(80);
  });

  it('should return 0 attendance_rate when there are no records', async () => {
    mockPrisma.staffAttendanceRecord.groupBy.mockResolvedValue([]);

    const result = await service.staffAttendanceRate(TENANT_ID);

    expect(result.attendance_rate).toBe(0);
    expect(result.total_records).toBe(0);
  });

  // ─── qualificationCoverage ────────────────────────────────────────────────

  it('should return has_qualified_teacher true when teachers exist for a subject', async () => {
    mockPrisma.subject.findMany.mockResolvedValue([
      { id: 'sub-1', name: 'Physics' },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([
      { id: 'class-1' },
    ]);
    mockPrisma.classStaff.count.mockResolvedValue(2);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.has_qualified_teacher).toBe(true);
    expect(result[0]!.teacher_count).toBe(2);
  });

  it('should return has_qualified_teacher false when no classes exist for a subject', async () => {
    mockPrisma.subject.findMany.mockResolvedValue([
      { id: 'sub-2', name: 'Chemistry' },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([]);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.has_qualified_teacher).toBe(false);
    expect(result[0]!.teacher_count).toBe(0);
  });

  // ─── compensationDistribution ─────────────────────────────────────────────

  it('should return empty array when no salaried compensations exist', async () => {
    mockPrisma.staffCompensation.findMany.mockResolvedValue([]);

    const result = await service.compensationDistribution(TENANT_ID);

    expect(result).toHaveLength(0);
  });

  it('should return 5 salary buckets with correct percentage totals', async () => {
    mockPrisma.staffCompensation.findMany.mockResolvedValue([
      { base_salary: '30000' },
      { base_salary: '40000' },
      { base_salary: '50000' },
      { base_salary: '60000' },
      { base_salary: '70000' },
    ]);

    const result = await service.compensationDistribution(TENANT_ID);

    expect(result).toHaveLength(5);
    const totalCount = result.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(5);
    const totalPct = result.reduce((s, b) => s + b.percentage, 0);
    expect(Math.round(totalPct)).toBe(100);
  });
});
