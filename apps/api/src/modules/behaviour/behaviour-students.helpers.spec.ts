import { Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import {
  ACTIVE_INCIDENT_FILTER,
  computeAnalyticsSummary,
  computeAttendanceCorrelation,
  computeCategoryBreakdown,
  computePeriodComparison,
  computeSanctionHistory,
  computeWeeklyTrend,
  getWeekStart,
  mapParentIncidentToDto,
  toDateString,
} from './behaviour-students.helpers';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';

// ─── Factories ──────────────────────────────────────────────────────────

const makePrismaService = () =>
  ({
    behaviourIncidentParticipant: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { points_awarded: null } }),
    },
    behaviourIntervention: {
      count: jest.fn().mockResolvedValue(0),
    },
    behaviourSanction: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    dailyAttendanceSummary: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  }) as unknown as PrismaService;

const makeLogger = () =>
  ({
    debug: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  }) as unknown as Logger;

// ─── Tests ──────────────────────────────────────────────────────────────

describe('behaviour-students.helpers', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Constants ──────────────────────────────────────────────────────────

  describe('ACTIVE_INCIDENT_FILTER', () => {
    it('should define correct retention status', () => {
      expect(ACTIVE_INCIDENT_FILTER.retention_status).toBe('active');
    });

    it('should exclude draft and withdrawn statuses', () => {
      expect(ACTIVE_INCIDENT_FILTER.status.notIn).toContain('draft');
      expect(ACTIVE_INCIDENT_FILTER.status.notIn).toContain('withdrawn');
    });
  });

  // ─── Date utilities ─────────────────────────────────────────────────────

  describe('getWeekStart', () => {
    it('should return Monday for a Sunday date', () => {
      const sunday = new Date('2026-03-29'); // Sunday
      const monday = getWeekStart(sunday);
      expect(monday.getDay()).toBe(1); // Monday
      expect(monday.toISOString().slice(0, 10)).toBe('2026-03-23'); // Previous Monday
    });

    it('should return Monday for a Saturday date', () => {
      const saturday = new Date('2026-03-28'); // Saturday
      const monday = getWeekStart(saturday);
      expect(monday.getDay()).toBe(1);
      expect(monday.toISOString().slice(0, 10)).toBe('2026-03-23');
    });

    it('should return same day for a Monday', () => {
      const monday = new Date('2026-03-23'); // Monday
      const result = getWeekStart(monday);
      expect(result.getDay()).toBe(1);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-23');
    });

    it('should reset time to midnight', () => {
      const date = new Date('2026-03-25T14:30:00Z'); // Wednesday with time
      const result = getWeekStart(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe('toDateString', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2026-03-15T10:00:00Z');
      expect(toDateString(date)).toBe('2026-03-15');
    });

    it('should handle different timezones correctly', () => {
      const date = new Date('2026-12-31T23:59:59Z');
      expect(toDateString(date)).toBe('2026-12-31');
    });
  });

  // ─── mapParentIncidentToDto ─────────────────────────────────────────────

  describe('mapParentIncidentToDto', () => {
    it('should map incident with parent description', () => {
      const incident = {
        id: 'inc-1',
        incident_number: 'BH-001',
        polarity: 'negative',
        severity: 3,
        parent_description: 'Student was disruptive',
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15'),
        category: {
          id: 'cat-1',
          name: 'Disruption',
          name_ar: 'إخلال',
          polarity: 'negative',
        },
      };

      const result = mapParentIncidentToDto(incident);

      expect(result.description).toBe('Student was disruptive');
      expect(result.description_ar).toBe('إخلال');
      expect(result.category?.name).toBe('Disruption');
    });

    it('should fall back to category name when no parent description', () => {
      const incident = {
        id: 'inc-1',
        incident_number: 'BH-001',
        polarity: 'negative',
        severity: 3,
        parent_description: null,
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15'),
        category: {
          id: 'cat-1',
          name: 'Disruption',
          name_ar: null,
          polarity: 'negative',
        },
      };

      const result = mapParentIncidentToDto(incident);

      expect(result.description).toBe('Disruption');
      expect(result.description_ar).toBeNull();
    });

    it('should handle null category', () => {
      const incident = {
        id: 'inc-1',
        incident_number: 'BH-001',
        polarity: 'negative',
        severity: 3,
        parent_description: null,
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15'),
        category: null,
      };

      const result = mapParentIncidentToDto(incident);

      expect(result.description).toBe('Incident');
      expect(result.category).toBeNull();
    });

    it('should preserve category details', () => {
      const incident = {
        id: 'inc-1',
        incident_number: 'BH-001',
        polarity: 'positive',
        severity: 1,
        parent_description: 'Good behavior',
        parent_description_ar: 'سلوك جيد',
        occurred_at: new Date('2026-03-15'),
        category: {
          id: 'cat-2',
          name: 'Positive',
          name_ar: 'إيجابي',
          polarity: 'positive',
        },
      };

      const result = mapParentIncidentToDto(incident);

      expect(result.id).toBe('inc-1');
      expect(result.incident_number).toBe('BH-001');
      expect(result.polarity).toBe('positive');
      expect(result.severity).toBe(1);
      expect(result.category).toEqual({
        id: 'cat-2',
        name: 'Positive',
        name_ar: 'إيجابي',
        polarity: 'positive',
      });
    });
  });

  // ─── computeAnalyticsSummary ──────────────────────────────────────────────

  describe('computeAnalyticsSummary', () => {
    it('should use materialized view when available', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          positive_count: 5n,
          negative_count: 3n,
          neutral_count: 1n,
          total_points: 42n,
        },
      ]);

      const result = await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(result).toMatchObject({
        total_incidents: 9,
        positive_count: 5,
        negative_count: 3,
        neutral_count: 1,
        total_points: 42,
        positive_ratio: 0.56,
      });
    });

    it('should fall back to direct queries when MV fails', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('MV not found'));
      (prisma.behaviourIncidentParticipant.count as jest.Mock)
        .mockResolvedValueOnce(5) // positive
        .mockResolvedValueOnce(3) // negative
        .mockResolvedValueOnce(1); // neutral
      (prisma.behaviourIncidentParticipant.aggregate as jest.Mock).mockResolvedValue({
        _sum: { points_awarded: 25 },
      });
      (prisma.behaviourIntervention.count as jest.Mock).mockResolvedValue(2);
      (prisma.behaviourSanction.count as jest.Mock).mockResolvedValue(1);

      const result = await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('MV mv_student_behaviour_summary not available'),
      );
      expect(result.positive_count).toBe(5);
      expect(result.negative_count).toBe(3);
      expect(result.neutral_count).toBe(1);
      expect(result.total_points).toBe(25);
      expect(result.active_interventions).toBe(2);
      expect(result.pending_sanctions).toBe(1);
    });

    it('should handle empty MV result and fallback to zeros', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prisma.behaviourIncidentParticipant.count as jest.Mock).mockResolvedValue(0);
      (prisma.behaviourIncidentParticipant.aggregate as jest.Mock).mockResolvedValue({
        _sum: { points_awarded: null },
      });

      const result = await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(result.total_incidents).toBe(0);
      expect(result.positive_ratio).toBe(0);
      expect(result.total_points).toBe(0);
    });

    it('should calculate positive ratio correctly', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          positive_count: 7n,
          negative_count: 3n,
          neutral_count: 0n,
          total_points: 35n,
        },
      ]);

      const result = await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(result.positive_ratio).toBe(0.7); // 7/10
    });

    it('should return 0 positive ratio when no incidents', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          positive_count: 0n,
          negative_count: 0n,
          neutral_count: 0n,
          total_points: 0n,
        },
      ]);

      const result = await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(result.positive_ratio).toBe(0);
    });

    it('should query interventions with correct status filter', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prisma.behaviourIncidentParticipant.count as jest.Mock).mockResolvedValue(0);
      (prisma.behaviourIncidentParticipant.aggregate as jest.Mock).mockResolvedValue({
        _sum: { points_awarded: 0 },
      });

      await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIntervention.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: ['active_intervention', 'monitoring'],
            },
            retention_status: 'active',
          }),
        }),
      );
    });

    it('should query sanctions with correct status filter', async () => {
      const prisma = makePrismaService();
      const logger = makeLogger();

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prisma.behaviourIncidentParticipant.count as jest.Mock).mockResolvedValue(0);
      (prisma.behaviourIncidentParticipant.aggregate as jest.Mock).mockResolvedValue({
        _sum: { points_awarded: 0 },
      });

      await computeAnalyticsSummary(prisma, logger, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourSanction.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: ['pending_approval', 'scheduled'],
            },
            retention_status: 'active',
          }),
        }),
      );
    });
  });

  // ─── computeWeeklyTrend ─────────────────────────────────────────────────

  describe('computeWeeklyTrend', () => {
    it('should return 13 weeks of data', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      const result = await computeWeeklyTrend(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(13);
    });

    it('should aggregate incidents by week', async () => {
      const prisma = makePrismaService();
      const mondayDate = new Date('2026-03-23'); // Monday
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        { incident: { occurred_at: mondayDate } },
        { incident: { occurred_at: new Date('2026-03-24') } }, // Same week
        { incident: { occurred_at: new Date('2026-03-30') } }, // Next week
      ]);

      const result = await computeWeeklyTrend(prisma, TENANT_ID, STUDENT_ID);

      // Find the week containing March 23
      const march23Week = result.find((r) => r.week_start === '2026-03-23');
      expect(march23Week?.count).toBe(2);
    });

    it('should filter incidents from last 90 days', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      await computeWeeklyTrend(prisma, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident: expect.objectContaining({
              occurred_at: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          }),
        }),
      );
    });

    it('should handle weeks with no incidents', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      const result = await computeWeeklyTrend(prisma, TENANT_ID, STUDENT_ID);

      expect(result.every((r) => r.count === 0)).toBe(true);
    });
  });

  // ─── computeCategoryBreakdown ─────────────────────────────────────────────

  describe('computeCategoryBreakdown', () => {
    it('should aggregate incidents by category', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        {
          incident: {
            category_id: 'cat-1',
            polarity: 'negative',
            category: { id: 'cat-1', name: 'Disruption' },
          },
        },
        {
          incident: {
            category_id: 'cat-1',
            polarity: 'negative',
            category: { id: 'cat-1', name: 'Disruption' },
          },
        },
        {
          incident: {
            category_id: 'cat-2',
            polarity: 'positive',
            category: { id: 'cat-2', name: 'Achievement' },
          },
        },
      ]);

      const result = await computeCategoryBreakdown(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        category_id: 'cat-1',
        category_name: 'Disruption',
        polarity: 'negative',
        count: 2,
      });
      expect(result[1]).toMatchObject({
        category_id: 'cat-2',
        category_name: 'Achievement',
        polarity: 'positive',
        count: 1,
      });
    });

    it('should sort by count descending', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        { incident: { category_id: 'cat-1', polarity: 'negative', category: { name: 'Cat1' } } },
        { incident: { category_id: 'cat-2', polarity: 'negative', category: { name: 'Cat2' } } },
        { incident: { category_id: 'cat-2', polarity: 'negative', category: { name: 'Cat2' } } },
      ]);

      const result = await computeCategoryBreakdown(prisma, TENANT_ID, STUDENT_ID);

      expect(result[0].category_id).toBe('cat-2');
      expect(result[0].count).toBe(2);
      expect(result[1].count).toBe(1);
    });

    it('should handle unknown category names', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        { incident: { category_id: 'cat-1', polarity: 'negative', category: null } },
      ]);

      const result = await computeCategoryBreakdown(prisma, TENANT_ID, STUDENT_ID);

      expect(result[0].category_name).toBe('Unknown');
    });

    it('should apply active incident filter', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      await computeCategoryBreakdown(prisma, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident: expect.objectContaining({
              retention_status: 'active',
            }),
          }),
        }),
      );
    });
  });

  // ─── computePeriodComparison ────────────────────────────────────────────

  describe('computePeriodComparison', () => {
    it('should aggregate incidents by academic period', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        {
          incident: {
            academic_period_id: 'period-1',
            academic_period: { id: 'period-1', name: 'Term 1' },
          },
        },
        {
          incident: {
            academic_period_id: 'period-1',
            academic_period: { id: 'period-1', name: 'Term 1' },
          },
        },
        {
          incident: {
            academic_period_id: 'period-2',
            academic_period: { id: 'period-2', name: 'Term 2' },
          },
        },
      ]);

      const result = await computePeriodComparison(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.period_id === 'period-1')).toMatchObject({
        period_name: 'Term 1',
        incident_count: 2,
      });
      expect(result.find((r) => r.period_id === 'period-2')).toMatchObject({
        period_name: 'Term 2',
        incident_count: 1,
      });
    });

    it('should exclude incidents without academic period', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        {
          incident: {
            academic_period_id: 'period-1',
            academic_period: { name: 'Term 1' },
          },
        },
        {
          incident: {
            academic_period_id: null,
            academic_period: null,
          },
        },
      ]);

      const result = await computePeriodComparison(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].period_id).toBe('period-1');
    });

    it('should filter to only active incidents', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      await computePeriodComparison(prisma, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident: expect.objectContaining({
              retention_status: 'active',
            }),
          }),
        }),
      );
    });

    it('should handle unknown period names', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        {
          incident: {
            academic_period_id: 'period-1',
            academic_period: null,
          },
        },
      ]);

      const result = await computePeriodComparison(prisma, TENANT_ID, STUDENT_ID);

      expect(result[0].period_name).toBe('Unknown');
    });
  });

  // ─── computeSanctionHistory ─────────────────────────────────────────────

  describe('computeSanctionHistory', () => {
    it('should aggregate sanctions by type', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourSanction.findMany as jest.Mock).mockResolvedValue([
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'no_show' },
        { type: 'suspension', status: 'served' },
      ]);

      const result = await computeSanctionHistory(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      const detention = result.find((r) => r.type === 'detention');
      expect(detention).toMatchObject({ total: 3, served: 2, no_show: 1 });
    });

    it('should count served and no_show statuses correctly', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourSanction.findMany as jest.Mock).mockResolvedValue([
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'no_show' },
        { type: 'detention', status: 'scheduled' },
      ]);

      const result = await computeSanctionHistory(prisma, TENANT_ID, STUDENT_ID);

      expect(result[0]).toMatchObject({
        type: 'detention',
        total: 4,
        served: 2,
        no_show: 1,
      });
    });

    it('should filter by active retention status', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourSanction.findMany as jest.Mock).mockResolvedValue([]);

      await computeSanctionHistory(prisma, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            retention_status: 'active',
          }),
        }),
      );
    });

    it('should return empty array when no sanctions', async () => {
      const prisma = makePrismaService();
      (prisma.behaviourSanction.findMany as jest.Mock).mockResolvedValue([]);

      const result = await computeSanctionHistory(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── computeAttendanceCorrelation ─────────────────────────────────────────

  describe('computeAttendanceCorrelation', () => {
    it('should return null when no attendance data', async () => {
      const prisma = makePrismaService();
      (prisma.dailyAttendanceSummary.count as jest.Mock).mockResolvedValue(0);

      const result = await computeAttendanceCorrelation(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toBeNull();
    });

    it('should count incidents on absent vs present days', async () => {
      const prisma = makePrismaService();
      (prisma.dailyAttendanceSummary.count as jest.Mock).mockResolvedValue(5);
      (prisma.dailyAttendanceSummary.findMany as jest.Mock).mockResolvedValue([
        { summary_date: new Date('2026-03-15'), derived_status: 'present' },
        { summary_date: new Date('2026-03-16'), derived_status: 'present' },
        { summary_date: new Date('2026-03-17'), derived_status: 'absent' },
        { summary_date: new Date('2026-03-18'), derived_status: 'late' },
      ]);
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        { incident: { occurred_at: new Date('2026-03-15T10:00:00Z') } }, // present day
        { incident: { occurred_at: new Date('2026-03-17T10:00:00Z') } }, // absent day
        { incident: { occurred_at: new Date('2026-03-18T10:00:00Z') } }, // late (counted as present)
      ]);

      const result = await computeAttendanceCorrelation(prisma, TENANT_ID, STUDENT_ID);

      expect(result).toMatchObject({
        total_days: 4,
        absent_days: 1,
        present_days: 3, // present + late
        incidents_on_absent_days: 1,
        incidents_on_present_days: 2,
      });
    });

    it('should handle days with no incidents', async () => {
      const prisma = makePrismaService();
      (prisma.dailyAttendanceSummary.count as jest.Mock).mockResolvedValue(3);
      (prisma.dailyAttendanceSummary.findMany as jest.Mock).mockResolvedValue([
        { summary_date: new Date('2026-03-15'), derived_status: 'present' },
        { summary_date: new Date('2026-03-16'), derived_status: 'absent' },
      ]);
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      const result = await computeAttendanceCorrelation(prisma, TENANT_ID, STUDENT_ID);

      expect(result?.incidents_on_absent_days).toBe(0);
      expect(result?.incidents_on_present_days).toBe(0);
    });

    it('should filter incidents to active only', async () => {
      const prisma = makePrismaService();
      (prisma.dailyAttendanceSummary.count as jest.Mock).mockResolvedValue(1);
      (prisma.dailyAttendanceSummary.findMany as jest.Mock).mockResolvedValue([
        { summary_date: new Date('2026-03-15'), derived_status: 'present' },
      ]);
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([]);

      await computeAttendanceCorrelation(prisma, TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident: expect.objectContaining({
              retention_status: 'active',
            }),
          }),
        }),
      );
    });

    it('should treat late as present', async () => {
      const prisma = makePrismaService();
      (prisma.dailyAttendanceSummary.count as jest.Mock).mockResolvedValue(1);
      (prisma.dailyAttendanceSummary.findMany as jest.Mock).mockResolvedValue([
        { summary_date: new Date('2026-03-15'), derived_status: 'late' },
      ]);
      (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mockResolvedValue([
        { incident: { occurred_at: new Date('2026-03-15') } },
      ]);

      const result = await computeAttendanceCorrelation(prisma, TENANT_ID, STUDENT_ID);

      expect(result?.present_days).toBe(1);
      expect(result?.incidents_on_present_days).toBe(1);
    });
  });
});
