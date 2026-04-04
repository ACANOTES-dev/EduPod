import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportDesInspectionService } from './pastoral-report-des-inspection.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Mock DB ────────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  sstMember: { findMany: jest.fn() },
  sstMeeting: { findMany: jest.fn() },
  pastoralConcern: { findMany: jest.fn(), count: jest.fn() },
  pastoralIntervention: { findMany: jest.fn() },
  pastoralReferral: { findMany: jest.fn() },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

type MockDb = ReturnType<typeof buildMockDb>;

function setupStandardMocks(db: MockDb): void {
  db.sstMember.findMany.mockResolvedValue([
    {
      user: { first_name: 'Jane', last_name: 'DLP' },
      role_description: 'Designated Liaison Person',
    },
    {
      user: { first_name: 'Bob', last_name: 'Deputy' },
      role_description: 'Deputy DLP',
    },
  ]);

  db.sstMeeting.findMany.mockResolvedValue([
    { id: 'meeting-1' },
    { id: 'meeting-2' },
    { id: 'meeting-3' },
  ]);

  db.pastoralConcern.findMany.mockResolvedValue([
    { category: 'academic', logged_by_user_id: USER_ID },
    { category: 'academic', logged_by_user_id: USER_ID },
    { category: 'bullying', logged_by_user_id: USER_ID_B },
  ]);

  db.pastoralIntervention.findMany.mockResolvedValue([
    {
      target_outcomes: { measurable_target: 'Improve attendance to 95%' },
      outcome_notes: 'Attendance improved to 93%.',
      continuum_level: 1,
    },
    {
      target_outcomes: { description: 'General support' },
      outcome_notes: '',
      continuum_level: 2,
    },
    {
      target_outcomes: { measurable_target: 'Reduce lateness' },
      outcome_notes: 'Lateness reduced significantly.',
      continuum_level: 3,
    },
  ]);

  db.pastoralReferral.findMany.mockResolvedValue([
    { referral_type: 'neps' },
    { referral_type: 'neps' },
    { referral_type: 'camhs' },
  ]);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportDesInspectionService', () => {
  let service: PastoralReportDesInspectionService;
  let mockEventService: { write: jest.Mock };
  let mockDb: MockDb;

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportDesInspectionService,
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportDesInspectionService>(PastoralReportDesInspectionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── build ──────────────────────────────────────────────────────────────

  describe('PastoralReportDesInspectionService — build', () => {
    it('should return a complete report structure', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.period).toEqual({ from: '2025-04-01', to: '2026-03-31' });
      expect(result.pastoral_care_policy_summary).toBeDefined();
      expect(result.sst_composition).toHaveLength(2);
      expect(result.meeting_frequency).toBeDefined();
      expect(result.concern_logging).toBeDefined();
      expect(result.intervention_quality).toBeDefined();
      expect(result.referral_pathways).toBeDefined();
      expect(result.continuum_coverage).toBeDefined();
      expect(result.staff_engagement).toBeDefined();
    });

    it('should use custom date range from filters', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-06-30',
      });

      expect(result.period).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    });

    it('should default to 1 year range when no dates provided', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {});

      // Period should span approximately 1 year ending today
      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();
      const from = new Date(result.period.from);
      const to = new Date(result.period.to);
      const diffMs = to.getTime() - from.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(364);
      expect(diffDays).toBeLessThanOrEqual(366);
    });

    it('should calculate correct meeting frequency', async () => {
      setupStandardMocks(mockDb);

      // 3 meetings over 12 months
      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.meeting_frequency.total_meetings).toBe(3);
      expect(result.meeting_frequency.average_per_month).toBe(0.25); // 3 / 12
    });

    it('should count concerns by category', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.concern_logging.total).toBe(3);
      expect(result.concern_logging.by_category).toEqual({
        academic: 2,
        bullying: 1,
      });
    });

    it('should calculate intervention quality percentages', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      // 2 out of 3 have measurable_target key = 67%
      expect(result.intervention_quality.with_measurable_targets_percent).toBe(67);
      // 2 out of 3 have non-empty outcome_notes = 67%
      expect(result.intervention_quality.with_documented_outcomes_percent).toBe(67);
    });

    it('should count referrals by type', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.referral_pathways.total).toBe(3);
      expect(result.referral_pathways.by_type).toEqual({ neps: 2, camhs: 1 });
    });

    it('should count continuum coverage levels', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.continuum_coverage).toEqual({
        level_1: 1,
        level_2: 1,
        level_3: 1,
      });
    });

    it('should fire audit event', async () => {
      setupStandardMocks(mockDb);

      const filters = { from_date: '2025-04-01', to_date: '2026-03-31' };
      await service.build(mockDb as never, TENANT_ID, USER_ID, filters);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'report_generated',
          actor_user_id: USER_ID,
          payload: expect.objectContaining({ report_type: 'des_inspection' }),
        }),
      );
    });
  });
});
