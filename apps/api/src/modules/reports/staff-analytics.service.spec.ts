import { Test, TestingModule } from '@nestjs/testing';

import { ReportsDataAccessService } from './reports-data-access.service';
import { StaffAnalyticsService } from './staff-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('StaffAnalyticsService', () => {
  let service: StaffAnalyticsService;
  let mockDataAccess: {
    groupStaffBy: jest.Mock;
    countStaff: jest.Mock;
    findStaffProfiles: jest.Mock;
    countStudents: jest.Mock;
    groupStaffAttendanceBy: jest.Mock;
    findSubjects: jest.Mock;
    findClasses: jest.Mock;
    countClassStaff: jest.Mock;
    findStaffCompensations: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      groupStaffBy: jest.fn(),
      countStaff: jest.fn(),
      findStaffProfiles: jest.fn(),
      countStudents: jest.fn(),
      groupStaffAttendanceBy: jest.fn(),
      findSubjects: jest.fn(),
      findClasses: jest.fn(),
      countClassStaff: jest.fn(),
      findStaffCompensations: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffAnalyticsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<StaffAnalyticsService>(StaffAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── headcountByDepartment ────────────────────────────────────────────────

  it('should return headcount grouped by department sorted descending', async () => {
    mockDataAccess.groupStaffBy
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
    mockDataAccess.groupStaffBy
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
    mockDataAccess.countStaff.mockResolvedValue(10);
    mockDataAccess.countStudents.mockResolvedValue(200);

    const result = await service.staffStudentRatio(TENANT_ID);

    expect(result.active_staff).toBe(10);
    expect(result.active_students).toBe(200);
    expect(result.students_per_teacher).toBe(20);
    expect(result.ratio).toBe('1:20');
  });

  it('should return 0 students_per_teacher when no active staff', async () => {
    mockDataAccess.countStaff.mockResolvedValue(0);
    mockDataAccess.countStudents.mockResolvedValue(50);

    const result = await service.staffStudentRatio(TENANT_ID);

    expect(result.students_per_teacher).toBe(0);
    expect(result.ratio).toBe('1:0');
  });

  // ─── tenureDistribution ───────────────────────────────────────────────────

  it('should return 5 tenure buckets with percentage summing to 100', async () => {
    const now = new Date();
    const makeDate = (yearsAgo: number) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - yearsAgo);
      return d;
    };

    mockDataAccess.findStaffProfiles.mockResolvedValue([
      { created_at: makeDate(0) },
      { created_at: makeDate(2) },
      { created_at: makeDate(4) },
      { created_at: makeDate(7) },
      { created_at: makeDate(12) },
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
    mockDataAccess.groupStaffAttendanceBy.mockResolvedValue([
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
    mockDataAccess.groupStaffAttendanceBy.mockResolvedValue([]);

    const result = await service.staffAttendanceRate(TENANT_ID);

    expect(result.attendance_rate).toBe(0);
    expect(result.total_records).toBe(0);
  });

  // ─── qualificationCoverage ────────────────────────────────────────────────

  it('should return has_qualified_teacher true when teachers exist for a subject', async () => {
    mockDataAccess.findSubjects.mockResolvedValue([{ id: 'sub-1', name: 'Physics' }]);
    mockDataAccess.findClasses.mockResolvedValue([{ id: 'class-1' }]);
    mockDataAccess.countClassStaff.mockResolvedValue(2);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.has_qualified_teacher).toBe(true);
    expect(result[0]!.teacher_count).toBe(2);
  });

  it('should return has_qualified_teacher false when no classes exist for a subject', async () => {
    mockDataAccess.findSubjects.mockResolvedValue([{ id: 'sub-2', name: 'Chemistry' }]);
    mockDataAccess.findClasses.mockResolvedValue([]);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.has_qualified_teacher).toBe(false);
    expect(result[0]!.teacher_count).toBe(0);
  });

  // ─── compensationDistribution ─────────────────────────────────────────────

  it('should return empty array when no salaried compensations exist', async () => {
    mockDataAccess.findStaffCompensations.mockResolvedValue([]);

    const result = await service.compensationDistribution(TENANT_ID);

    expect(result).toHaveLength(0);
  });

  it('should return 5 salary buckets with correct percentage totals', async () => {
    mockDataAccess.findStaffCompensations.mockResolvedValue([
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

  // ─── Edge cases for compensationDistribution ─────────────────────────

  it('edge: should return empty array when all salaries are 0 or null', async () => {
    mockDataAccess.findStaffCompensations.mockResolvedValue([
      { base_salary: '0' },
      { base_salary: null },
    ]);

    const result = await service.compensationDistribution(TENANT_ID);

    // All salaries filter to 0 after Number(...) > 0 check, so salaries.length === 0
    expect(result).toHaveLength(0);
  });

  it('edge: should handle all same salary (range = 0, bucketSize = 1000)', async () => {
    mockDataAccess.findStaffCompensations.mockResolvedValue([
      { base_salary: '50000' },
      { base_salary: '50000' },
      { base_salary: '50000' },
    ]);

    const result = await service.compensationDistribution(TENANT_ID);

    expect(result).toHaveLength(5);
    // All 3 should be in one bucket
    const totalCount = result.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(3);
  });

  // ─── Edge cases for headcountByDepartment ────────────────────────────

  it('edge: should return 0 active_count when department has no active staff in activeMap', async () => {
    mockDataAccess.groupStaffBy
      .mockResolvedValueOnce([{ department: 'Admin', _count: 3 }])
      .mockResolvedValueOnce([
        // No entry for 'Admin' in active groups
      ]);

    const result = await service.headcountByDepartment(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.active_count).toBe(0);
  });

  // ─── Edge cases for tenureDistribution ───────────────────────────────

  it('edge: should return all zero counts and percentages when no staff exist', async () => {
    mockDataAccess.findStaffProfiles.mockResolvedValue([]);

    const result = await service.tenureDistribution(TENANT_ID);

    expect(result).toHaveLength(5);
    for (const bucket of result) {
      expect(bucket.count).toBe(0);
      expect(bucket.percentage).toBe(0);
    }
  });

  // ─── Edge cases for staffAttendanceRate ──────────────────────────────

  it('edge: should count half_day, paid_leave, sick_leave as present', async () => {
    mockDataAccess.groupStaffAttendanceBy.mockResolvedValue([
      { status: 'half_day', _count: 5 },
      { status: 'paid_leave', _count: 3 },
      { status: 'sick_leave', _count: 2 },
    ]);

    const result = await service.staffAttendanceRate(TENANT_ID);

    expect(result.present_count).toBe(10);
    expect(result.absent_count).toBe(0);
    expect(result.total_records).toBe(10);
    expect(result.attendance_rate).toBe(100);
  });

  it('edge: should count unpaid_leave as absent', async () => {
    mockDataAccess.groupStaffAttendanceBy.mockResolvedValue([
      { status: 'present', _count: 80 },
      { status: 'unpaid_leave', _count: 10 },
      { status: 'absent', _count: 10 },
    ]);

    const result = await service.staffAttendanceRate(TENANT_ID);

    expect(result.present_count).toBe(80);
    expect(result.absent_count).toBe(20);
    expect(result.total_records).toBe(100);
    expect(result.attendance_rate).toBe(80);
  });

  // ─── Edge cases for qualificationCoverage ────────────────────────────

  it('edge: should sort unqualified subjects after qualified ones', async () => {
    mockDataAccess.findSubjects.mockResolvedValue([
      { id: 'sub-1', name: 'Physics' },
      { id: 'sub-2', name: 'Chemistry' },
    ]);
    // Physics has classes + teachers, Chemistry has no classes
    mockDataAccess.findClasses.mockResolvedValueOnce([{ id: 'class-1' }]).mockResolvedValueOnce([]);
    mockDataAccess.countClassStaff.mockResolvedValueOnce(1);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result[0]!.has_qualified_teacher).toBe(true);
    expect(result[0]!.subject_name).toBe('Physics');
    expect(result[1]!.has_qualified_teacher).toBe(false);
    expect(result[1]!.subject_name).toBe('Chemistry');
  });

  it('edge: should return empty array when no subjects exist', async () => {
    mockDataAccess.findSubjects.mockResolvedValue([]);

    const result = await service.qualificationCoverage(TENANT_ID);

    expect(result).toHaveLength(0);
  });
});
