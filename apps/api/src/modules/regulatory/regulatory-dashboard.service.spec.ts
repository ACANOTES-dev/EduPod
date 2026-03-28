import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryDashboardService } from './regulatory-dashboard.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const buildMockPrisma = () => ({
  regulatoryCalendarEvent: {
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  attendancePatternAlert: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  regulatorySubmission: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  ppodStudentMapping: {
    count: jest.fn().mockResolvedValue(0),
  },
  ppodSyncLog: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegulatoryDashboardService', () => {
  let service: RegulatoryDashboardService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryDashboardService>(RegulatoryDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getDashboardSummary ────────────────────────────────────────────────

  describe('getDashboardSummary', () => {
    it('should return empty dashboard when no data exists', async () => {
      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.calendar.upcoming_deadlines).toBe(0);
      expect(result.calendar.overdue).toBe(0);
      expect(result.calendar.next_deadline).toBeNull();
      expect(result.tusla.active_alerts).toBe(0);
      expect(result.tusla.students_approaching_threshold).toBe(0);
      expect(result.tusla.students_exceeded_threshold).toBe(0);
      expect(result.des.readiness_status).toBe('not_started');
      expect(result.des.recent_submissions).toBe(0);
      expect(result.october_returns.readiness_status).toBe('not_started');
      expect(result.ppod.synced).toBe(0);
      expect(result.ppod.pending).toBe(0);
      expect(result.ppod.errors).toBe(0);
      expect(result.ppod.last_sync_at).toBeNull();
      expect(result.cba.pending_sync).toBe(0);
      expect(result.cba.synced).toBe(0);
      expect(result.cba.last_sync_at).toBeNull();
    });

    it('should aggregate calendar deadlines correctly', async () => {
      const nextDeadline = {
        id: 'event-1',
        title: 'Tusla SAR Period 1',
        domain: 'tusla_attendance',
        due_date: new Date('2026-04-15'),
      };

      mockPrisma.regulatoryCalendarEvent.count
        .mockResolvedValueOnce(3) // upcoming
        .mockResolvedValueOnce(1); // overdue
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue(nextDeadline);

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.calendar.upcoming_deadlines).toBe(3);
      expect(result.calendar.overdue).toBe(1);
      expect(result.calendar.next_deadline).toEqual(nextDeadline);
    });

    it('should count Tusla alerts and categorise by threshold status', async () => {
      mockPrisma.attendancePatternAlert.count.mockResolvedValue(5);
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([
        { student_id: 's1', details_json: { source: 'tusla_threshold_scan', status: 'exceeded' } },
        { student_id: 's2', details_json: { source: 'tusla_threshold_scan', status: 'approaching' } },
        { student_id: 's3', details_json: { source: 'tusla_threshold_scan', status: 'approaching' } },
      ]);

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.tusla.active_alerts).toBe(5);
      expect(result.tusla.students_exceeded_threshold).toBe(1);
      expect(result.tusla.students_approaching_threshold).toBe(2);
    });

    it('should deduplicate students with multiple Tusla alerts', async () => {
      mockPrisma.attendancePatternAlert.count.mockResolvedValue(4);
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([
        { student_id: 's1', details_json: { source: 'tusla_threshold_scan', status: 'exceeded' } },
        { student_id: 's1', details_json: { source: 'tusla_threshold_scan', status: 'exceeded' } },
        { student_id: 's2', details_json: { source: 'tusla_threshold_scan', status: 'approaching' } },
        { student_id: 's2', details_json: { source: 'tusla_threshold_scan', status: 'approaching' } },
      ]);

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.tusla.students_exceeded_threshold).toBe(1);
      expect(result.tusla.students_approaching_threshold).toBe(1);
    });

    it('should exclude non-Tusla alerts from threshold counts', async () => {
      mockPrisma.attendancePatternAlert.count.mockResolvedValue(3);
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([
        { student_id: 's1', details_json: { source: 'tusla_threshold_scan', status: 'exceeded' } },
        { student_id: 's2', details_json: { source: 'other_source', status: 'exceeded' } },
        { student_id: 's3', details_json: { source: 'manual', status: 'approaching' } },
      ]);

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.tusla.active_alerts).toBe(3);
      expect(result.tusla.students_exceeded_threshold).toBe(1);
      expect(result.tusla.students_approaching_threshold).toBe(0);
    });

    it('should return DES readiness as ready when a submission is submitted', async () => {
      mockPrisma.regulatorySubmission.findMany.mockImplementation(
        (args: { where: { domain: string } }) => {
          if (args.where.domain === 'des_september_returns') {
            return Promise.resolve([{ status: 'reg_submitted' }]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.des.readiness_status).toBe('ready');
      expect(result.des.recent_submissions).toBe(1);
    });

    it('should return DES readiness as incomplete when submissions exist but none completed', async () => {
      mockPrisma.regulatorySubmission.findMany.mockImplementation(
        (args: { where: { domain: string } }) => {
          if (args.where.domain === 'des_september_returns') {
            return Promise.resolve([{ status: 'draft' }]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.des.readiness_status).toBe('incomplete');
    });

    it('should aggregate PPOD sync statuses correctly', async () => {
      mockPrisma.ppodStudentMapping.count.mockImplementation(
        (args: { where: { sync_status: string } }) => {
          const statusCounts: Record<string, number> = {
            synced: 50,
            pod_pending: 10,
            changed: 5,
            pod_error: 3,
          };
          return Promise.resolve(statusCounts[args.where.sync_status] ?? 0);
        },
      );

      const syncDate = new Date('2026-03-27T10:00:00Z');
      mockPrisma.ppodSyncLog.findFirst.mockResolvedValue({ created_at: syncDate });

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.ppod.synced).toBe(50);
      expect(result.ppod.pending).toBe(15); // 10 pending + 5 changed
      expect(result.ppod.errors).toBe(3);
      expect(result.ppod.last_sync_at).toEqual(syncDate);
    });

    it('should aggregate CBA sync summary', async () => {
      mockPrisma.regulatorySubmission.count.mockImplementation(
        (args: { where: { domain?: string; submission_type?: string; status?: { notIn?: string[]; in?: string[] } } }) => {
          if (args.where.domain !== 'ppod_sync' || args.where.submission_type !== 'cba_sync') {
            return Promise.resolve(0);
          }
          if (args.where.status && 'notIn' in args.where.status) {
            return Promise.resolve(4); // pending_sync
          }
          if (args.where.status && 'in' in args.where.status) {
            return Promise.resolve(12); // synced
          }
          return Promise.resolve(0);
        },
      );

      const cbaSyncDate = new Date('2026-03-26T14:30:00Z');
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ created_at: cbaSyncDate });

      const result = await service.getDashboardSummary(TENANT_ID);

      expect(result.cba.pending_sync).toBe(4);
      expect(result.cba.synced).toBe(12);
      expect(result.cba.last_sync_at).toEqual(cbaSyncDate);
    });
  });

  // ─── getOverdueItems ───────────────────────────────────────────────────

  describe('getOverdueItems', () => {
    it('should return empty array when nothing is overdue', async () => {
      const result = await service.getOverdueItems(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should return overdue items sorted by days_overdue descending', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const fiveDaysAgo = new Date(now);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([
        { id: 'e1', title: 'Event 1', domain: 'tusla_attendance', due_date: twoDaysAgo },
        { id: 'e2', title: 'Event 2', domain: 'des_september_returns', due_date: fiveDaysAgo },
      ]);

      const result = await service.getOverdueItems(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('e2'); // 5 days overdue first
      expect(result[1]!.id).toBe('e1'); // 2 days overdue second
      expect(result[0]!.days_overdue).toBeGreaterThan(result[1]!.days_overdue);
    });

    it('should set type to calendar_event for all items', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([
        { id: 'e1', title: 'Event 1', domain: 'tusla_attendance', due_date: threeDaysAgo },
      ]);

      const result = await service.getOverdueItems(TENANT_ID);

      expect(result[0]!.type).toBe('calendar_event');
    });

    it('should calculate days_overdue correctly', async () => {
      const exactlyTenDaysAgo = new Date();
      exactlyTenDaysAgo.setDate(exactlyTenDaysAgo.getDate() - 10);
      exactlyTenDaysAgo.setHours(0, 0, 0, 0);

      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([
        { id: 'e1', title: 'Old Event', domain: 'des_october_census', due_date: exactlyTenDaysAgo },
      ]);

      const result = await service.getOverdueItems(TENANT_ID);

      expect(result[0]!.days_overdue).toBeGreaterThanOrEqual(10);
    });

    it('should pass correct filters to prisma query', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);

      await service.getOverdueItems(TENANT_ID);

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: { notIn: ['reg_submitted', 'reg_accepted'] },
            due_date: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });
  });
});
