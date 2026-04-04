import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { WorkloadDataService } from './workload-data.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID_1 = '11111111-1111-1111-1111-111111111111';
const STAFF_ID_2 = '22222222-2222-2222-2222-222222222222';
const ACAD_YEAR_ID = 'aaaa0000-0000-0000-0000-000000000001';
const PERIOD_ID = 'bbbb0000-0000-0000-0000-000000000001';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkloadDataService', () => {
  let service: WorkloadDataService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    academicPeriod: { findFirst: jest.Mock };
    substitutionRecord: { count: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    schedule: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: { findFirst: jest.fn() },
      academicPeriod: { findFirst: jest.fn() },
      substitutionRecord: { count: jest.fn() },
      staffProfile: { findMany: jest.fn() },
      schedule: { findMany: jest.fn() },
      tenantSetting: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkloadDataService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<WorkloadDataService>(WorkloadDataService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getActiveAcademicYear ──────────────────────────────────────────────────

  describe('WorkloadDataService — getActiveAcademicYear', () => {
    it('should return the active academic year for the tenant', async () => {
      const expected = {
        id: ACAD_YEAR_ID,
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
      };
      mockPrisma.academicYear.findFirst.mockResolvedValue(expected);

      const result = await service.getActiveAcademicYear(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
      );

      expect(result).toEqual(expected);
      expect(mockPrisma.academicYear.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'active' },
        select: { id: true, start_date: true, end_date: true },
      });
    });

    it('should return null when no active academic year exists', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.getActiveAcademicYear(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
      );

      expect(result).toBeNull();
    });
  });

  // ─── getCurrentPeriod ───────────────────────────────────────────────────────

  describe('WorkloadDataService — getCurrentPeriod', () => {
    it('should return the current academic period', async () => {
      const expected = {
        id: PERIOD_ID,
        start_date: new Date('2026-01-05'),
        end_date: new Date('2026-03-27'),
      };
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(expected);

      const result = await service.getCurrentPeriod(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        ACAD_YEAR_ID,
      );

      expect(result).toEqual(expected);
    });

    it('should return null when no period covers the current date', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentPeriod(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        ACAD_YEAR_ID,
      );

      expect(result).toBeNull();
    });
  });

  // ─── getPreviousPeriod ──────────────────────────────────────────────────────

  describe('WorkloadDataService — getPreviousPeriod', () => {
    it('should return the period ending before the current one', async () => {
      const currentPeriod = {
        id: PERIOD_ID,
        start_date: new Date('2026-01-05'),
        end_date: new Date('2026-03-27'),
      };
      const previous = {
        id: 'prev-period',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2025-12-20'),
      };
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(previous);

      const result = await service.getPreviousPeriod(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        ACAD_YEAR_ID,
        currentPeriod,
      );

      expect(result).toEqual(previous);
      expect(mockPrisma.academicPeriod.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          academic_year_id: ACAD_YEAR_ID,
          end_date: { lt: currentPeriod.start_date },
        },
        orderBy: { end_date: 'desc' },
        select: { id: true, start_date: true, end_date: true },
      });
    });
  });

  // ─── countCoversInRange ─────────────────────────────────────────────────────

  describe('WorkloadDataService — countCoversInRange', () => {
    it('should count substitution records for a staff member in date range', async () => {
      mockPrisma.substitutionRecord.count.mockResolvedValue(3);

      const start = new Date('2026-01-01');
      const end = new Date('2026-03-31');
      const result = await service.countCoversInRange(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STAFF_ID_1,
        start,
        end,
      );

      expect(result).toBe(3);
      expect(mockPrisma.substitutionRecord.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          substitute_staff_id: STAFF_ID_1,
          status: { in: ['assigned', 'confirmed', 'completed'] },
          created_at: { gte: start, lte: end },
        },
      });
    });
  });

  // ─── computeSchoolAverageCovers ─────────────────────────────────────────────

  describe('WorkloadDataService — computeSchoolAverageCovers', () => {
    it('should return 0 when no staff exist', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const result = await service.computeSchoolAverageCovers(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-03-31'),
      );

      expect(result).toBe(0);
    });

    it('should compute the average cover count across all staff', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([{ id: STAFF_ID_1 }, { id: STAFF_ID_2 }]);
      // Staff 1 has 4 covers, Staff 2 has 6 covers -> avg = 5
      mockPrisma.substitutionRecord.count.mockResolvedValueOnce(4).mockResolvedValueOnce(6);

      const result = await service.computeSchoolAverageCovers(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-03-31'),
      );

      expect(result).toBe(5);
    });

    it('should round the average to 2 decimal places', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_ID_1 },
        { id: STAFF_ID_2 },
        { id: '33333333-3333-3333-3333-333333333333' },
      ]);
      mockPrisma.substitutionRecord.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);

      const result = await service.computeSchoolAverageCovers(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        new Date('2026-01-01'),
        new Date('2026-03-31'),
      );

      // (1+2+3)/3 = 2
      expect(result).toBe(2);
    });
  });

  // ─── getTeacherSchedules ────────────────────────────────────────────────────

  describe('WorkloadDataService — getTeacherSchedules', () => {
    it('should fetch schedules with period template and class includes', async () => {
      const schedules = [
        {
          id: 'sched-1',
          weekday: 1,
          period_order: null,
          room_id: 'room-a',
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
          class_entity: { name: 'Maths 8A' },
        },
      ];
      mockPrisma.schedule.findMany.mockResolvedValue(schedules);

      const result = await service.getTeacherSchedules(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STAFF_ID_1,
        ACAD_YEAR_ID,
      );

      expect(result).toEqual(schedules);
      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          teacher_staff_id: STAFF_ID_1,
          academic_year_id: ACAD_YEAR_ID,
        },
        select: expect.objectContaining({
          id: true,
          weekday: true,
          period_order: true,
          room_id: true,
        }),
      });
    });
  });

  // ─── getWellbeingThresholds ─────────────────────────────────────────────────

  describe('WorkloadDataService — getWellbeingThresholds', () => {
    it('should return defaults when no tenant settings exist', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const result = await service.getWellbeingThresholds(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
      );

      expect(result).toEqual({
        workload_high_threshold_periods: 22,
        workload_high_threshold_covers: 8,
      });
    });

    it('should return defaults when settings lack wellbeing section', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: {} },
      });

      const result = await service.getWellbeingThresholds(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
      );

      expect(result).toEqual({
        workload_high_threshold_periods: 22,
        workload_high_threshold_covers: 8,
      });
    });

    it('should return configured thresholds from tenant settings', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          staff_wellbeing: {
            workload_high_threshold_periods: 25,
            workload_high_threshold_covers: 10,
          },
        },
      });

      const result = await service.getWellbeingThresholds(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
      );

      expect(result).toEqual({
        workload_high_threshold_periods: 25,
        workload_high_threshold_covers: 10,
      });
    });
  });

  // ─── computeStatus ─────────────────────────────────────────────────────────

  describe('WorkloadDataService — computeStatus', () => {
    const thresholds = {
      workload_high_threshold_periods: 22,
      workload_high_threshold_covers: 8,
    };

    it('should return "normal" when both below thresholds', () => {
      expect(service.computeStatus(20, 5, thresholds)).toBe('normal');
    });

    it('should return "elevated" when only periods exceed threshold', () => {
      expect(service.computeStatus(25, 5, thresholds)).toBe('elevated');
    });

    it('should return "elevated" when only covers exceed threshold', () => {
      expect(service.computeStatus(20, 10, thresholds)).toBe('elevated');
    });

    it('should return "high" when both exceed thresholds', () => {
      expect(service.computeStatus(25, 10, thresholds)).toBe('high');
    });

    it('should return "normal" when values equal the thresholds (not exceeding)', () => {
      expect(service.computeStatus(22, 8, thresholds)).toBe('normal');
    });
  });

  // ─── round2 ─────────────────────────────────────────────────────────────────

  describe('WorkloadDataService — round2', () => {
    it('should round to 2 decimal places', () => {
      expect(WorkloadDataService.round2(1.236)).toBe(1.24);
      expect(WorkloadDataService.round2(1.234)).toBe(1.23);
      expect(WorkloadDataService.round2(5)).toBe(5);
    });
  });
});
