import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportWellbeingService } from './pastoral-report-wellbeing.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock DB ────────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  student: { count: jest.fn() },
  pastoralIntervention: { findMany: jest.fn() },
  pastoralReferral: { count: jest.fn() },
  pastoralConcern: { count: jest.fn() },
});

type MockDb = ReturnType<typeof buildMockDb>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function setupStandardMocks(db: MockDb): void {
  db.student.count.mockResolvedValue(100);

  // Level 2+ interventions for coverage calc
  db.pastoralIntervention.findMany
    .mockResolvedValueOnce([
      // Level 2+ interventions (first call)
      { student_id: STUDENT_ID },
      { student_id: STUDENT_ID_B },
    ])
    .mockResolvedValueOnce([
      // All interventions (second call)
      {
        continuum_level: 1,
        intervention_type: 'mentoring',
        student_id: STUDENT_ID,
        student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
      },
      {
        continuum_level: 2,
        intervention_type: 'counselling',
        student_id: STUDENT_ID,
        student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
      },
      {
        continuum_level: 3,
        intervention_type: 'mentoring',
        student_id: STUDENT_ID_B,
        student: { year_group_id: YG_ID, year_group: { name: 'Year 5' } },
      },
    ]);

  db.pastoralReferral.count.mockResolvedValue(5);

  // Two calls to pastoralConcern.count: total, then with case
  db.pastoralConcern.count
    .mockResolvedValueOnce(20) // total concerns
    .mockResolvedValueOnce(4); // concerns with case
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportWellbeingService', () => {
  let service: PastoralReportWellbeingService;
  let mockEventService: { write: jest.Mock };
  let mockDb: MockDb;

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportWellbeingService,
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportWellbeingService>(PastoralReportWellbeingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── build ──────────────────────────────────────────────────────────────

  describe('PastoralReportWellbeingService — build', () => {
    it('should return a complete wellbeing report', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.period).toEqual({ from: '2026-01-01', to: '2026-03-31' });
      expect(result.intervention_coverage_percent).toBeDefined();
      expect(result.continuum_distribution).toBeDefined();
      expect(result.referral_rate).toBeDefined();
      expect(result.concern_to_case_conversion_rate).toBeDefined();
      expect(result.intervention_type_distribution).toBeDefined();
      expect(result.by_year_group).toBeDefined();
    });

    it('should calculate intervention coverage percentage', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // 2 unique students out of 100 total = 2%
      expect(result.intervention_coverage_percent).toBe(2);
    });

    it('should handle zero total students with 0% coverage', async () => {
      mockDb.student.count.mockResolvedValue(0);
      mockDb.pastoralIntervention.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDb.pastoralReferral.count.mockResolvedValue(0);
      mockDb.pastoralConcern.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.intervention_coverage_percent).toBe(0);
      expect(result.referral_rate).toBe(0);
      expect(result.concern_to_case_conversion_rate).toBe(0);
    });

    it('should distribute interventions across continuum levels', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.continuum_distribution).toEqual({
        level_1: 1,
        level_2: 1,
        level_3: 1,
      });
    });

    it('should calculate referral rate', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // 5 referrals / 100 students = 5%
      expect(result.referral_rate).toBe(5);
    });

    it('should calculate concern-to-case conversion rate', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // 4 concerns with case / 20 total = 20%
      expect(result.concern_to_case_conversion_rate).toBe(20);
    });

    it('should group interventions by year group', async () => {
      setupStandardMocks(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      expect(result.by_year_group).toHaveLength(1);
      expect(result.by_year_group[0]).toEqual(
        expect.objectContaining({
          year_group_name: 'Year 5',
          intervention_count: 3,
          student_count: 2,
        }),
      );
    });

    it('should apply year_group_id filter from filters', async () => {
      setupStandardMocks(mockDb);

      await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
        year_group_id: YG_ID,
      });

      // student.count should be called with year_group_id filter
      const studentCountCall = mockDb.student.count.mock.calls[0][0];
      expect(studentCountCall.where.year_group_id).toBe(YG_ID);
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
          payload: expect.objectContaining({
            report_type: 'wellbeing_programme',
          }),
        }),
      );
    });
  });
});
