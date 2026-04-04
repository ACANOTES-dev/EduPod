import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportSstActivityService } from './pastoral-report-sst-activity.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock DB ────────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  pastoralCase: { findMany: jest.fn(), count: jest.fn() },
  pastoralConcern: { findMany: jest.fn() },
  pastoralIntervention: { findMany: jest.fn() },
  sstMeetingAction: { findMany: jest.fn() },
});

type MockDb = ReturnType<typeof buildMockDb>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function setupStandardMocks(db: MockDb): void {
  // Cases opened
  db.pastoralCase.count
    .mockResolvedValueOnce(5) // cases opened
    .mockResolvedValueOnce(2); // cases closed

  // All cases with resolution data
  db.pastoralCase.findMany.mockResolvedValue([
    {
      tier: 1,
      created_at: new Date('2026-01-10T10:00:00Z'),
      resolved_at: new Date('2026-01-24T10:00:00Z'),
      closed_at: null,
    },
    {
      tier: 2,
      created_at: new Date('2026-01-15T10:00:00Z'),
      resolved_at: null,
      closed_at: new Date('2026-02-14T10:00:00Z'),
    },
    {
      tier: 1,
      created_at: new Date('2026-02-01T10:00:00Z'),
      resolved_at: null,
      closed_at: null,
    },
  ]);

  // Concerns with year group info
  db.pastoralConcern.findMany.mockResolvedValue([
    {
      category: 'academic',
      severity: 'routine',
      created_at: new Date('2026-01-15T10:00:00Z'),
      student_id: STUDENT_ID,
      student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
    },
    {
      category: 'bullying',
      severity: 'significant',
      created_at: new Date('2026-01-16T10:00:00Z'),
      student_id: STUDENT_ID_B,
      student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
    },
    {
      category: 'academic',
      severity: 'routine',
      created_at: new Date('2026-02-01T10:00:00Z'),
      student_id: STUDENT_ID,
      student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
    },
  ]);

  // Interventions
  db.pastoralIntervention.findMany.mockResolvedValue([
    { status: 'achieved' },
    { status: 'partially_achieved' },
    { status: 'in_progress' },
  ]);

  // Actions
  db.sstMeetingAction.findMany.mockResolvedValue([
    {
      status: 'pc_completed',
      due_date: new Date('2026-02-01'),
      completed_at: new Date('2026-01-30'),
    },
    {
      status: 'pc_completed',
      due_date: new Date('2026-02-15'),
      completed_at: new Date('2026-02-14'),
    },
    { status: 'pending', due_date: new Date('2025-01-01'), completed_at: null },
  ]);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportSstActivityService', () => {
  let service: PastoralReportSstActivityService;
  let mockEventService: { write: jest.Mock };
  let mockDb: MockDb;

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportSstActivityService,
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportSstActivityService>(PastoralReportSstActivityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── build ──────────────────────────────────────────────────────────────

  describe('PastoralReportSstActivityService — build', () => {
    it('should return a complete SST activity report', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.period).toEqual({ from: '2026-01-01', to: '2026-03-31' });
      expect(result.cases_opened).toBe(5);
      expect(result.cases_closed).toBe(2);
      expect(result.cases_by_severity).toEqual({ tier_1: 2, tier_2: 1 });
      expect(result.concern_volume.total).toBe(3);
      expect(result.concern_volume.by_category).toEqual({ academic: 2, bullying: 1 });
      expect(result.intervention_outcomes).toBeDefined();
      expect(result.action_completion_rate).toBeDefined();
      expect(result.by_year_group).toBeDefined();
    });

    it('should calculate avg resolution days correctly', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Case 1: 14 days (Jan 10 to Jan 24), Case 2: 30 days (Jan 15 to Feb 14)
      // avg = (14 + 30) / 2 = 22
      expect(result.avg_resolution_days).toBe(22);
    });

    it('should handle zero resolved cases with null avg', async () => {
      mockDb.pastoralCase.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      mockDb.pastoralCase.findMany.mockResolvedValue([
        {
          tier: 1,
          created_at: new Date('2026-01-10T10:00:00Z'),
          resolved_at: null,
          closed_at: null,
        },
      ]);
      mockDb.pastoralConcern.findMany.mockResolvedValue([]);
      mockDb.pastoralIntervention.findMany.mockResolvedValue([]);
      mockDb.sstMeetingAction.findMany.mockResolvedValue([]);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.avg_resolution_days).toBeNull();
    });

    it('should count intervention outcomes by status', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.intervention_outcomes).toEqual({
        achieved: 1,
        partially_achieved: 1,
        not_achieved: 0,
        escalated: 0,
        in_progress: 1,
      });
    });

    it('should calculate action completion rate', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // 2 completed out of 3 total = 67%
      expect(result.action_completion_rate).toBe(67);
    });

    it('should handle zero actions with 0% completion', async () => {
      mockDb.pastoralCase.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockDb.pastoralCase.findMany.mockResolvedValue([]);
      mockDb.pastoralConcern.findMany.mockResolvedValue([]);
      mockDb.pastoralIntervention.findMany.mockResolvedValue([]);
      mockDb.sstMeetingAction.findMany.mockResolvedValue([]);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.action_completion_rate).toBe(0);
    });

    it('should group concerns by year group', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.by_year_group).toHaveLength(1);
      expect(result.by_year_group[0]).toEqual(
        expect.objectContaining({
          year_group_name: 'Year 5',
          student_count: 2,
          concern_count: 3,
        }),
      );
    });

    it('should fire audit event', async () => {
      setupStandardMocks(mockDb);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-31' };
      await service.build(mockDb as never, TENANT_ID, USER_ID, filters);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'report_generated',
          actor_user_id: USER_ID,
          payload: expect.objectContaining({ report_type: 'sst_activity' }),
        }),
      );
    });
  });
});
