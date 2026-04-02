import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UUID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('ReportsDataAccessService', () => {
  let service: ReportsDataAccessService;
  let mockPrisma: { [key: string]: any };

  beforeEach(async () => {
    mockPrisma = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsDataAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsDataAccessService>(ReportsDataAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Student methods', () => {
    beforeEach(() => {
      mockPrisma.student = {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
      };
    });

    it('countStudents should apply tenant isolation', async () => {
      mockPrisma.student.count.mockResolvedValue(150);
      const result = await service.countStudents(TENANT_ID);
      expect(result).toBe(150);
      expect(mockPrisma.student.count).toHaveBeenCalledWith({ where: { tenant_id: TENANT_ID } });
    });

    it('countStudents should apply additional where clauses', async () => {
      await service.countStudents(TENANT_ID, { status: 'active' });
      expect(mockPrisma.student.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'active' },
      });
    });

    it('countStudentsByStatus should return counts', async () => {
      mockPrisma.student.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(30);
      const result = await service.countStudentsByStatus(TENANT_ID);
      expect(result).toEqual({ active: 120, total: 150, applicants: 30 });
    });

    it('findStudents should return data with tenant isolation', async () => {
      const students = [{ id: UUID(1), first_name: 'Alice' }];
      mockPrisma.student.findMany.mockResolvedValue(students);
      const result = await service.findStudents(TENANT_ID, {});
      expect(result).toEqual(students);
    });

    it('groupStudentsBy should group by field', async () => {
      const groups = [{ status: 'active', _count: 100 }];
      mockPrisma.student.groupBy.mockResolvedValue(groups);
      const result = await service.groupStudentsBy(TENANT_ID, ['status']);
      expect(result).toEqual(groups);
      expect(mockPrisma.student.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { tenant_id: TENANT_ID },
        _count: true,
      });
    });
  });

  describe('Staff methods', () => {
    beforeEach(() => {
      mockPrisma.staffProfile = {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      };
    });

    it('countStaff should apply tenant isolation', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(25);
      const result = await service.countStaff(TENANT_ID);
      expect(result).toBe(25);
      expect(mockPrisma.staffProfile.count).toHaveBeenCalledWith({ where: { tenant_id: TENANT_ID } });
    });

    it('countStaffByStatus should return active and total', async () => {
      mockPrisma.staffProfile.count.mockResolvedValueOnce(20).mockResolvedValueOnce(25);
      const result = await service.countStaffByStatus(TENANT_ID);
      expect(result).toEqual({ active: 20, total: 25 });
    });

    it('groupStaffBy should group by department', async () => {
      const groups = [{ department: 'Science', _count: 5 }];
      mockPrisma.staffProfile.groupBy.mockResolvedValue(groups);
      const result = await service.groupStaffBy(TENANT_ID, ['department']);
      expect(result).toEqual(groups);
    });
  });

  describe('Class methods', () => {
    beforeEach(() => {
      mockPrisma.class = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.classStaff = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.classEnrolment = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
    });

    it('countClasses should return count', async () => {
      mockPrisma.class.count.mockResolvedValue(30);
      const result = await service.countClasses(TENANT_ID);
      expect(result).toBe(30);
    });

    it('findClasses should return classes', async () => {
      const classes = [{ id: UUID(1), name: '5A' }];
      mockPrisma.class.findMany.mockResolvedValue(classes);
      const result = await service.findClasses(TENANT_ID);
      expect(result).toEqual(classes);
    });

    it('countClassEnrolments should return count', async () => {
      mockPrisma.classEnrolment.count.mockResolvedValue(200);
      const result = await service.countClassEnrolments(TENANT_ID);
      expect(result).toBe(200);
    });
  });

  describe('Attendance methods', () => {
    beforeEach(() => {
      mockPrisma.attendanceRecord = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) };
      mockPrisma.attendanceSession = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.staffAttendanceRecord = { groupBy: jest.fn().mockResolvedValue([]) };
    });

    it('groupAttendanceRecordsBy should group by status', async () => {
      const groups = [{ status: 'present', _count: 80 }];
      mockPrisma.attendanceRecord.groupBy.mockResolvedValue(groups);
      const result = await service.groupAttendanceRecordsBy(TENANT_ID, ['status']);
      expect(result).toEqual(groups);
    });

    it('countAttendanceRecords should return count', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(500);
      const result = await service.countAttendanceRecords(TENANT_ID);
      expect(result).toBe(500);
    });

    it('groupStaffAttendanceBy should group by status', async () => {
      const groups = [{ status: 'present', _count: 40 }];
      mockPrisma.staffAttendanceRecord.groupBy.mockResolvedValue(groups);
      const result = await service.groupStaffAttendanceBy(TENANT_ID, ['status']);
      expect(result).toEqual(groups);
    });
  });

  describe('Grade methods', () => {
    beforeEach(() => {
      mockPrisma.grade = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }) };
      mockPrisma.assessment = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
    });

    it('aggregateGrades should return average as number', async () => {
      mockPrisma.grade.aggregate.mockResolvedValue({ _avg: { raw_score: 75.5 } });
      const result = await service.aggregateGrades(TENANT_ID);
      expect(result._avg.raw_score).toBe(75.5);
    });

    it('groupGradesBy should group by student_id', async () => {
      const groups = [{ student_id: UUID(1), _count: 5 }];
      mockPrisma.grade.groupBy.mockResolvedValue(groups);
      const result = await service.groupGradesBy(TENANT_ID, ['student_id']);
      expect(result).toEqual(groups);
    });
  });

  describe('Invoice methods', () => {
    beforeEach(() => {
      mockPrisma.invoice = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { total_amount: null, balance_amount: null } }) };
      mockPrisma.payment = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('aggregateInvoices should return sum', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { total_amount: 10000, balance_amount: 2000 } });
      const result = await service.aggregateInvoices(TENANT_ID);
      expect(result._sum.total_amount).toBe(10000);
      expect(result._sum.balance_amount).toBe(2000);
    });

    it('countInvoices should return count', async () => {
      mockPrisma.invoice.count.mockResolvedValue(80);
      const result = await service.countInvoices(TENANT_ID);
      expect(result).toBe(80);
    });
  });

  describe('Academic methods', () => {
    beforeEach(() => {
      mockPrisma.yearGroup = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.academicPeriod = { findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.subject = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('findYearGroups should apply default orderBy', async () => {
      await service.findYearGroups(TENANT_ID);
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { display_order: 'asc' },
      });
    });
  });

  describe('AuditLog methods', () => {
    beforeEach(() => {
      mockPrisma.auditLog = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) };
    });

    it('countAuditLogs should return count', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      const result = await service.countAuditLogs(TENANT_ID);
      expect(result).toBe(100);
    });
  });

  describe('Schedule and Approval methods', () => {
    beforeEach(() => {
      mockPrisma.schedule = { count: jest.fn().mockResolvedValue(0) };
      mockPrisma.approvalRequest = { count: jest.fn().mockResolvedValue(0) };
    });

    it('countSchedules should return count', async () => {
      mockPrisma.schedule.count.mockResolvedValue(50);
      const result = await service.countSchedules(TENANT_ID);
      expect(result).toBe(50);
    });

    it('countApprovalRequests should return count', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(10);
      const result = await service.countApprovalRequests(TENANT_ID);
      expect(result).toBe(10);
    });
  });
});
