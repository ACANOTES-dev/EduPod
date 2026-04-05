import { Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
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

describe('behaviour-students.helpers', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── getWeekStart ─────────────────────────────────────────────────────────

  describe('getWeekStart', () => {
    it('should return Monday for a Wednesday input', () => {
      // 2026-04-01 is a Wednesday
      const result = getWeekStart(new Date('2026-04-01T12:00:00Z'));
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(30); // March 30
    });

    it('should return Monday for a Monday input', () => {
      // 2026-03-30 is a Monday
      const result = getWeekStart(new Date('2026-03-30T12:00:00Z'));
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(30);
    });

    it('should return previous Monday for a Sunday input', () => {
      // 2026-04-05 is a Sunday
      const result = getWeekStart(new Date('2026-04-05T12:00:00Z'));
      expect(result.getDay()).toBe(1); // Monday
      // Should be March 30
      expect(result.getDate()).toBe(30);
    });

    it('should return Monday for a Saturday input', () => {
      // 2026-04-04 is a Saturday
      const result = getWeekStart(new Date('2026-04-04T12:00:00Z'));
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(30);
    });

    it('should zero out hours/minutes/seconds', () => {
      const result = getWeekStart(new Date('2026-04-01T15:30:45Z'));
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  // ─── toDateString ─────────────────────────────────────────────────────────

  describe('toDateString', () => {
    it('should return YYYY-MM-DD format', () => {
      const result = toDateString(new Date('2026-04-01T15:30:00Z'));
      expect(result).toBe('2026-04-01');
    });

    it('should handle start of year', () => {
      const result = toDateString(new Date('2026-01-01T00:00:00Z'));
      expect(result).toBe('2026-01-01');
    });
  });

  // ─── mapParentIncidentToDto ───────────────────────────────────────────────

  describe('mapParentIncidentToDto', () => {
    it('should map parent_description as description', () => {
      const result = mapParentIncidentToDto({
        id: 'inc-1',
        incident_number: 'INC-001',
        polarity: 'negative',
        severity: 3,
        parent_description: 'Safe parent text',
        parent_description_ar: 'نص عربي',
        occurred_at: new Date('2026-03-15'),
        category: { id: 'cat-1', name: 'Disruption', name_ar: null, polarity: 'negative' },
      });

      expect(result.description).toBe('Safe parent text');
      expect(result.description_ar).toBe('نص عربي');
      expect(result.category).toEqual({
        id: 'cat-1',
        name: 'Disruption',
        name_ar: null,
        polarity: 'negative',
      });
    });

    it('should fall back to category name when parent_description is null', () => {
      const result = mapParentIncidentToDto({
        id: 'inc-1',
        incident_number: 'INC-001',
        polarity: 'positive',
        severity: 1,
        parent_description: null,
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15'),
        category: {
          id: 'cat-1',
          name: 'Good Behaviour',
          name_ar: 'سلوك جيد',
          polarity: 'positive',
        },
      });

      expect(result.description).toBe('Good Behaviour');
      expect(result.description_ar).toBe('سلوك جيد');
    });

    it('should fall back to "Incident" when both parent_description and category are null', () => {
      const result = mapParentIncidentToDto({
        id: 'inc-1',
        incident_number: 'INC-001',
        polarity: 'negative',
        severity: 2,
        parent_description: null,
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15'),
        category: null,
      });

      expect(result.description).toBe('Incident');
      expect(result.description_ar).toBeNull();
      expect(result.category).toBeNull();
    });
  });

  // ─── computeAnalyticsSummary ──────────────────────────────────────────────

  describe('computeAnalyticsSummary', () => {
    const logger = new Logger('test');

    it('should use materialized view data when available', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            positive_count: BigInt(10),
            negative_count: BigInt(3),
            neutral_count: BigInt(2),
            total_points: BigInt(50),
          },
        ]),
        behaviourIntervention: { count: jest.fn().mockResolvedValue(1) },
        behaviourSanction: { count: jest.fn().mockResolvedValue(2) },
      };

      const result = await computeAnalyticsSummary(
        mockPrisma as unknown as PrismaService,
        logger,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result.positive_count).toBe(10);
      expect(result.negative_count).toBe(3);
      expect(result.neutral_count).toBe(2);
      expect(result.total_points).toBe(50);
      expect(result.total_incidents).toBe(15);
      expect(result.positive_ratio).toBeCloseTo(0.67, 2);
      expect(result.active_interventions).toBe(1);
      expect(result.pending_sanctions).toBe(2);
    });

    it('should fall back to direct queries when MV throws', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('relation does not exist')),
        behaviourIncidentParticipant: {
          count: jest
            .fn()
            .mockResolvedValueOnce(5) // positive
            .mockResolvedValueOnce(2) // negative
            .mockResolvedValueOnce(1), // neutral
          aggregate: jest.fn().mockResolvedValue({ _sum: { points_awarded: 30 } }),
        },
        behaviourIntervention: { count: jest.fn().mockResolvedValue(0) },
        behaviourSanction: { count: jest.fn().mockResolvedValue(0) },
      };

      const result = await computeAnalyticsSummary(
        mockPrisma as unknown as PrismaService,
        logger,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result.positive_count).toBe(5);
      expect(result.negative_count).toBe(2);
      expect(result.neutral_count).toBe(1);
      expect(result.total_points).toBe(30);
      expect(result.total_incidents).toBe(8);
    });

    it('should fall back to direct queries when MV returns empty', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        behaviourIncidentParticipant: {
          count: jest
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
          aggregate: jest.fn().mockResolvedValue({ _sum: { points_awarded: null } }),
        },
        behaviourIntervention: { count: jest.fn().mockResolvedValue(0) },
        behaviourSanction: { count: jest.fn().mockResolvedValue(0) },
      };

      const result = await computeAnalyticsSummary(
        mockPrisma as unknown as PrismaService,
        logger,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result.total_incidents).toBe(0);
      expect(result.positive_ratio).toBe(0);
      expect(result.total_points).toBe(0);
    });

    it('edge: should handle MV row with null total_points', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            positive_count: BigInt(1),
            negative_count: BigInt(0),
            neutral_count: BigInt(0),
            total_points: null,
          },
        ]),
        behaviourIntervention: { count: jest.fn().mockResolvedValue(0) },
        behaviourSanction: { count: jest.fn().mockResolvedValue(0) },
      };

      const result = await computeAnalyticsSummary(
        mockPrisma as unknown as PrismaService,
        logger,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result.total_points).toBe(0);
      expect(result.positive_ratio).toBe(1);
    });
  });

  // ─── computeWeeklyTrend ───────────────────────────────────────────────────

  describe('computeWeeklyTrend', () => {
    it('should return 13 weeks with zero-filled gaps', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const result = await computeWeeklyTrend(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(13);
      for (const week of result) {
        expect(week.count).toBe(0);
        expect(week.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('should bucket incidents by ISO week', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { incident: { occurred_at: new Date() } },
              { incident: { occurred_at: new Date() } },
            ]),
        },
      };

      const result = await computeWeeklyTrend(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      // The last entry (current week) should have count 2
      const currentWeekEntry = result[result.length - 1]!;
      expect(currentWeekEntry.count).toBe(2);
    });
  });

  // ─── computeCategoryBreakdown ─────────────────────────────────────────────

  describe('computeCategoryBreakdown', () => {
    it('should aggregate incidents by category and sort by count descending', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                incident: {
                  category_id: 'cat-1',
                  polarity: 'negative',
                  category: { name: 'Disruption' },
                },
              },
              {
                incident: {
                  category_id: 'cat-1',
                  polarity: 'negative',
                  category: { name: 'Disruption' },
                },
              },
              {
                incident: {
                  category_id: 'cat-2',
                  polarity: 'positive',
                  category: { name: 'Helpfulness' },
                },
              },
            ]),
        },
      };

      const result = await computeCategoryBreakdown(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.category_name).toBe('Disruption');
      expect(result[0]!.count).toBe(2);
      expect(result[1]!.category_name).toBe('Helpfulness');
      expect(result[1]!.count).toBe(1);
    });

    it('edge: should use "Unknown" when category is null', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { incident: { category_id: 'cat-x', polarity: 'negative', category: null } },
            ]),
        },
      };

      const result = await computeCategoryBreakdown(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result[0]!.category_name).toBe('Unknown');
    });
  });

  // ─── computePeriodComparison ──────────────────────────────────────────────

  describe('computePeriodComparison', () => {
    it('should aggregate incidents by academic period', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { incident: { academic_period_id: 'p1', academic_period: { name: 'Term 1' } } },
              { incident: { academic_period_id: 'p1', academic_period: { name: 'Term 1' } } },
              { incident: { academic_period_id: 'p2', academic_period: { name: 'Term 2' } } },
            ]),
        },
      };

      const result = await computePeriodComparison(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(2);
      const term1 = result.find((r) => r.period_id === 'p1');
      expect(term1!.incident_count).toBe(2);
    });

    it('edge: should skip entries with null academic_period_id', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ incident: { academic_period_id: null, academic_period: null } }]),
        },
      };

      const result = await computePeriodComparison(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(0);
    });

    it('edge: should use "Unknown" when academic_period is null', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ incident: { academic_period_id: 'p1', academic_period: null } }]),
        },
      };

      const result = await computePeriodComparison(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result[0]!.period_name).toBe('Unknown');
    });
  });

  // ─── computeSanctionHistory ───────────────────────────────────────────────

  describe('computeSanctionHistory', () => {
    it('should aggregate sanctions by type with served/no_show counts', async () => {
      const mockPrisma = {
        behaviourSanction: {
          findMany: jest.fn().mockResolvedValue([
            { type: 'detention', status: 'served' },
            { type: 'detention', status: 'served' },
            { type: 'detention', status: 'no_show' },
            { type: 'suspension_internal', status: 'scheduled' },
          ]),
        },
      };

      const result = await computeSanctionHistory(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(2);
      const detention = result.find((r) => r.type === 'detention');
      expect(detention!.total).toBe(3);
      expect(detention!.served).toBe(2);
      expect(detention!.no_show).toBe(1);

      const suspension = result.find((r) => r.type === 'suspension_internal');
      expect(suspension!.total).toBe(1);
      expect(suspension!.served).toBe(0);
      expect(suspension!.no_show).toBe(0);
    });

    it('should return empty array when no sanctions exist', async () => {
      const mockPrisma = {
        behaviourSanction: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const result = await computeSanctionHistory(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
      );

      expect(result).toHaveLength(0);
    });
  });

  // ─── computeAttendanceCorrelation ─────────────────────────────────────────

  describe('computeAttendanceCorrelation', () => {
    it('should return null when no attendance data exists', async () => {
      const mockPrisma = {} as unknown as PrismaService;
      const mockAttendanceFacade = {
        countAllDailySummariesForStudent: jest.fn().mockResolvedValue(0),
      };

      const result = await computeAttendanceCorrelation(
        mockPrisma,
        TENANT_ID,
        STUDENT_ID,
        mockAttendanceFacade as unknown as Parameters<typeof computeAttendanceCorrelation>[3],
      );

      expect(result).toBeNull();
    });

    it('should correlate incidents with attendance days', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest.fn().mockResolvedValue([
            { incident: { occurred_at: new Date('2026-03-10T09:00:00Z') } }, // absent day
            { incident: { occurred_at: new Date('2026-03-11T10:00:00Z') } }, // present day
            { incident: { occurred_at: new Date('2026-03-12T11:00:00Z') } }, // late day (counts as present)
          ]),
        },
      };
      const mockAttendanceFacade = {
        countAllDailySummariesForStudent: jest.fn().mockResolvedValue(3),
        findAllDailySummariesForStudent: jest.fn().mockResolvedValue([
          { summary_date: new Date('2026-03-10'), derived_status: 'absent' },
          { summary_date: new Date('2026-03-11'), derived_status: 'present' },
          { summary_date: new Date('2026-03-12'), derived_status: 'late' },
        ]),
      };

      const result = await computeAttendanceCorrelation(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        mockAttendanceFacade as unknown as Parameters<typeof computeAttendanceCorrelation>[3],
      );

      expect(result).not.toBeNull();
      expect(result!.total_days).toBe(3);
      expect(result!.absent_days).toBe(1);
      expect(result!.present_days).toBe(2);
      expect(result!.incidents_on_absent_days).toBe(1);
      expect(result!.incidents_on_present_days).toBe(2);
    });

    it('edge: should not count incidents on days with other attendance statuses', async () => {
      const mockPrisma = {
        behaviourIncidentParticipant: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ incident: { occurred_at: new Date('2026-03-10T09:00:00Z') } }]),
        },
      };
      const mockAttendanceFacade = {
        countAllDailySummariesForStudent: jest.fn().mockResolvedValue(1),
        findAllDailySummariesForStudent: jest
          .fn()
          .mockResolvedValue([{ summary_date: new Date('2026-03-10'), derived_status: 'excused' }]),
      };

      const result = await computeAttendanceCorrelation(
        mockPrisma as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        mockAttendanceFacade as unknown as Parameters<typeof computeAttendanceCorrelation>[3],
      );

      expect(result!.incidents_on_absent_days).toBe(0);
      expect(result!.incidents_on_present_days).toBe(0);
    });
  });
});
