import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportService } from './pastoral-report.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CASE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: {
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralCase: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralIntervention: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralReferral: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  cpAccessGrant: {
    findFirst: jest.fn(),
  },
  cpRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  staffProfile: {
    count: jest.fn(),
  },
  sstMember: {
    findMany: jest.fn(),
  },
  sstMeeting: {
    findMany: jest.fn(),
  },
  sstMeetingAction: {
    findMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  tenant_id: TENANT_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  full_name: 'Alice Smith',
  student_number: 'STU-001',
  year_group_id: 'yg-1',
  year_group: { name: 'Year 5' },
  homeroom_class: { name: '5A' },
  ...overrides,
});

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: 'concern-1',
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  occurred_at: new Date('2026-01-15T10:00:00Z'),
  actions_taken: 'Spoke with student',
  logged_by_user_id: USER_ID,
  logged_by: { first_name: 'Jane', last_name: 'Teacher' },
  versions: [
    {
      version_number: 1,
      narrative: 'Initial concern text',
      created_at: new Date('2026-01-15T10:00:00Z'),
      amended_by: { first_name: 'Jane', last_name: 'Teacher' },
      amendment_reason: null,
    },
  ],
  created_at: new Date('2026-01-15T10:00:00Z'),
  student: { year_group_id: 'yg-1', year_group: { name: 'Year 5' } },
  ...overrides,
});

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  case_number: 'PC-202603-0001',
  status: 'active',
  tier: 1,
  owner_user_id: USER_ID,
  owner: { first_name: 'Jane', last_name: 'Teacher' },
  next_review_date: new Date('2026-04-01'),
  created_at: new Date('2026-03-01T10:00:00Z'),
  resolved_at: null,
  closed_at: null,
  concerns: [{ id: 'concern-1' }],
  ...overrides,
});

const makeIntervention = (overrides: Record<string, unknown> = {}) => ({
  id: 'intervention-1',
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  case_id: CASE_ID,
  intervention_type: 'mentoring',
  continuum_level: 2,
  target_outcomes: { measurable_target: 'Improve attendance' },
  status: 'pc_active',
  outcome_notes: null,
  created_at: new Date('2026-02-01T10:00:00Z'),
  updated_at: new Date('2026-02-15T10:00:00Z'),
  student: { year_group_id: 'yg-1', year_group: { name: 'Year 5' } },
  ...overrides,
});

const makeReferral = (overrides: Record<string, unknown> = {}) => ({
  id: 'referral-1',
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  referral_type: 'neps',
  status: 'submitted',
  submitted_at: new Date('2026-02-15T10:00:00Z'),
  created_at: new Date('2026-02-15T10:00:00Z'),
  student: { year_group_id: 'yg-1' },
  ...overrides,
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('PastoralReportService', () => {
  let service: PastoralReportService;
  let mockEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };

    // Reset all mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportService>(PastoralReportService);
  });

  // ─── getStudentSummary ──────────────────────────────────────────────────

  describe('getStudentSummary', () => {
    it('should return concerns, cases, interventions for student', async () => {
      // Arrange — no CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([makeConcern()]);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([makeCase()]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([makeReferral()]);

      // Act
      const result = await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, {});

      // Assert
      expect(result.student.full_name).toBe('Alice Smith');
      expect(result.student.student_number).toBe('STU-001');
      expect(result.student.year_group).toBe('Year 5');
      expect(result.student.class_name).toBe('5A');
      expect(result.concerns).toHaveLength(1);
      expect(result.concerns[0]!.category).toBe('academic');
      expect(result.concerns[0]!.logged_by).toBe('Jane Teacher');
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]!.status).toBe('active');
      expect(result.cases[0]!.linked_concern_count).toBe(1);
      expect(result.interventions).toHaveLength(1);
      expect(result.interventions[0]!.type).toBe('mentoring');
      expect(result.referrals).toHaveLength(1);
      expect(result.referrals[0]!.referral_type).toBe('neps');
      expect(result.has_cp_records).toBe(false);
    });

    it('should exclude Tier 3 concerns when user lacks cp_access', async () => {
      // Arrange — no CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);

      // Act
      await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, {});

      // Assert — tier filter applied (only tiers 1 and 2)
      const concernQuery = mockRlsTx.pastoralConcern.findMany.mock.calls[0][0];
      expect(concernQuery.where.tier).toEqual({ in: [1, 2] });
      expect(concernQuery.where.OR).toEqual([
        { student_id: STUDENT_ID },
        {
          involved_students: {
            some: {
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
            },
          },
        },
      ]);
    });

    it('should include Tier 3 concerns when user has cp_access', async () => {
      // Arrange — with CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        user_id: USER_ID,
        revoked_at: null,
      });
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ tier: 3, category: 'child_protection' }),
      ]);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.count.mockResolvedValue(2);

      // Act
      const result = await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, {});

      // Assert — no tier restriction
      const concernQuery = mockRlsTx.pastoralConcern.findMany.mock.calls[0][0];
      expect(concernQuery.where.tier).toBeUndefined();
      expect(result.concerns[0]!.tier).toBe(3);
      expect(result.has_cp_records).toBe(true);
    });
  });

  // ─── getSstActivity ───────────────────────────────────────────────────────

  describe('getSstActivity', () => {
    it('should compute correct metrics', async () => {
      // Arrange
      mockRlsTx.pastoralCase.count
        .mockResolvedValueOnce(5) // cases opened
        .mockResolvedValueOnce(2); // cases closed

      mockRlsTx.pastoralCase.findMany.mockResolvedValue([
        {
          tier: 1,
          created_at: new Date('2026-01-01'),
          resolved_at: new Date('2026-01-15'),
          closed_at: null,
        },
        {
          tier: 2,
          created_at: new Date('2026-02-01'),
          resolved_at: null,
          closed_at: new Date('2026-02-28'),
        },
        {
          tier: 1,
          created_at: new Date('2026-03-01'),
          resolved_at: null,
          closed_at: null,
        },
      ]);

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ category: 'academic', severity: 'routine' }),
        makeConcern({
          id: 'concern-2',
          category: 'bullying',
          severity: 'concerning',
          created_at: new Date('2026-01-20T10:00:00Z'),
        }),
      ]);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        { status: 'achieved' },
        { status: 'pc_active' },
        { status: 'partially_achieved' },
      ]);

      mockRlsTx.sstMeetingAction.findMany.mockResolvedValue([
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
        {
          status: 'pc_pending',
          due_date: new Date('2025-12-01'), // overdue
          completed_at: null,
        },
      ]);

      // Act
      const result = await service.getSstActivity(TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Assert
      expect(result.cases_opened).toBe(5);
      expect(result.cases_closed).toBe(2);
      expect(result.cases_by_severity['tier_1']).toBe(2);
      expect(result.cases_by_severity['tier_2']).toBe(1);
      expect(result.avg_resolution_days).toBeDefined();
      expect(result.concern_volume.total).toBe(2);
      expect(result.concern_volume.by_category['academic']).toBe(1);
      expect(result.concern_volume.by_category['bullying']).toBe(1);
      expect(result.intervention_outcomes.achieved).toBe(1);
      expect(result.intervention_outcomes.in_progress).toBe(1);
      expect(result.intervention_outcomes.partially_achieved).toBe(1);
      expect(result.action_completion_rate).toBe(67); // 2/3 * 100 rounded
      expect(result.overdue_actions).toBe(1);
    });

    it('should handle empty data (no cases, no concerns)', async () => {
      // Arrange
      mockRlsTx.pastoralCase.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.sstMeetingAction.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getSstActivity(TENANT_ID, USER_ID, {});

      // Assert
      expect(result.cases_opened).toBe(0);
      expect(result.cases_closed).toBe(0);
      expect(result.avg_resolution_days).toBeNull();
      expect(result.concern_volume.total).toBe(0);
      expect(result.concern_volume.weekly_trend).toEqual([]);
      expect(result.action_completion_rate).toBe(0);
      expect(result.overdue_actions).toBe(0);
      expect(result.by_year_group).toEqual([]);
    });
  });

  // ─── getSafeguardingCompliance ────────────────────────────────────────────

  describe('getSafeguardingCompliance', () => {
    it('should hide Tier 3 data from non-DLP users', async () => {
      // Arrange — no CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralConcern.count
        .mockResolvedValueOnce(10) // tier 1
        .mockResolvedValueOnce(5); // tier 2
      mockRlsTx.staffProfile.count.mockResolvedValue(20);

      // Act
      const result = await service.getSafeguardingCompliance(TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Assert
      expect(result.concern_counts.tier_1).toBe(10);
      expect(result.concern_counts.tier_2).toBe(5);
      expect(result.concern_counts.tier_3).toBeNull();
      expect(result.mandated_reports).toBeNull();
      expect(result.active_cp_cases).toBeNull();
    });

    it('should include Tier 3 data for DLP users', async () => {
      // Arrange — with CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        user_id: USER_ID,
        revoked_at: null,
      });
      mockRlsTx.pastoralConcern.count
        .mockResolvedValueOnce(10) // tier 1
        .mockResolvedValueOnce(5) // tier 2
        .mockResolvedValueOnce(3); // tier 3
      mockRlsTx.cpRecord.findMany.mockResolvedValue([
        { mandated_report_status: 'submitted' },
        { mandated_report_status: 'submitted' },
        { mandated_report_status: 'acknowledged' },
      ]);
      mockRlsTx.staffProfile.count.mockResolvedValue(20);
      mockRlsTx.pastoralCase.count.mockResolvedValue(2);

      // Act
      const result = await service.getSafeguardingCompliance(TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Assert
      expect(result.concern_counts.tier_1).toBe(10);
      expect(result.concern_counts.tier_2).toBe(5);
      expect(result.concern_counts.tier_3).toBe(3);
      expect(result.mandated_reports).not.toBeNull();
      expect(result.mandated_reports?.total).toBe(3);
      expect(result.mandated_reports?.by_status['submitted']).toBe(2);
      expect(result.mandated_reports?.by_status['acknowledged']).toBe(1);
      expect(result.active_cp_cases).toBe(2);
    });
  });

  // ─── getWellbeingProgramme ────────────────────────────────────────────────

  describe('getWellbeingProgramme', () => {
    it('should compute intervention coverage correctly', async () => {
      // Arrange
      mockRlsTx.student.count.mockResolvedValue(100);
      // Level 2+ interventions — 15 unique students
      const level2Interventions = Array.from({ length: 20 }, (_, i) => ({
        student_id: `student-${i < 15 ? i : i - 5}`, // 15 unique students
      }));
      mockRlsTx.pastoralIntervention.findMany
        .mockResolvedValueOnce(level2Interventions) // level 2+
        .mockResolvedValueOnce([
          makeIntervention({ continuum_level: 1 }),
          makeIntervention({
            id: 'int-2',
            continuum_level: 2,
            intervention_type: 'counselling',
            student_id: 'student-0',
          }),
          makeIntervention({
            id: 'int-3',
            continuum_level: 3,
            intervention_type: 'mentoring',
            student_id: 'student-1',
          }),
        ]); // all interventions

      mockRlsTx.pastoralReferral.count.mockResolvedValue(10);
      mockRlsTx.pastoralConcern.count
        .mockResolvedValueOnce(50) // total concerns
        .mockResolvedValueOnce(8); // concerns with case

      // Act
      const result = await service.getWellbeingProgramme(TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Assert
      expect(result.intervention_coverage_percent).toBe(15); // 15/100 * 100
      expect(result.continuum_distribution.level_1).toBe(1);
      expect(result.continuum_distribution.level_2).toBe(1);
      expect(result.continuum_distribution.level_3).toBe(1);
      expect(result.referral_rate).toBe(10); // 10/100 * 100
      expect(result.concern_to_case_conversion_rate).toBe(16); // 8/50 * 100
      expect(result.intervention_type_distribution['mentoring']).toBe(2);
      expect(result.intervention_type_distribution['counselling']).toBe(1);
    });
  });

  // ─── getDesInspection ─────────────────────────────────────────────────────

  describe('getDesInspection', () => {
    it('should aggregate all data sections', async () => {
      // Arrange
      mockRlsTx.sstMember.findMany.mockResolvedValue([
        {
          user: { first_name: 'Alice', last_name: 'DLP' },
          role_description: 'Designated Liaison Person',
        },
        {
          user: { first_name: 'Bob', last_name: 'Deputy' },
          role_description: 'Deputy DLP',
        },
      ]);

      mockRlsTx.sstMeeting.findMany.mockResolvedValue([
        { id: 'meeting-1' },
        { id: 'meeting-2' },
        { id: 'meeting-3' },
      ]);

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        { category: 'academic', logged_by_user_id: 'staff-1' },
        { category: 'academic', logged_by_user_id: 'staff-1' },
        { category: 'bullying', logged_by_user_id: 'staff-2' },
      ]);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          target_outcomes: { measurable_target: 'Improve attendance' },
          outcome_notes: 'Good progress',
          continuum_level: 1,
        },
        {
          target_outcomes: { goals: ['Be kind'] },
          outcome_notes: null,
          continuum_level: 2,
        },
        {
          target_outcomes: { measurable_target: 'Reduce absences' },
          outcome_notes: 'Achieved',
          continuum_level: 3,
        },
      ]);

      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([
        { referral_type: 'neps' },
        { referral_type: 'neps' },
        { referral_type: 'camhs' },
      ]);

      // Act
      const result = await service.getDesInspection(TENANT_ID, USER_ID, {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
      });

      // Assert
      expect(result.sst_composition).toHaveLength(2);
      expect(result.sst_composition[0]!.user_name).toBe('Alice DLP');
      expect(result.sst_composition[0]!.role).toBe('Designated Liaison Person');

      expect(result.meeting_frequency.total_meetings).toBe(3);
      expect(result.meeting_frequency.average_per_month).toBe(1);

      expect(result.concern_logging.total).toBe(3);
      expect(result.concern_logging.by_category['academic']).toBe(2);
      expect(result.concern_logging.by_category['bullying']).toBe(1);

      expect(result.intervention_quality.with_measurable_targets_percent).toBe(67); // 2/3
      expect(result.intervention_quality.with_documented_outcomes_percent).toBe(67); // 2/3

      expect(result.referral_pathways.total).toBe(3);
      expect(result.referral_pathways.by_type['neps']).toBe(2);
      expect(result.referral_pathways.by_type['camhs']).toBe(1);

      expect(result.continuum_coverage.level_1).toBe(1);
      expect(result.continuum_coverage.level_2).toBe(1);
      expect(result.continuum_coverage.level_3).toBe(1);

      expect(result.staff_engagement.distinct_staff_logging_concerns).toBe(2);
    });
  });

  // ─── hasCpAccess (tested via getStudentSummary) ───────────────────────────

  describe('hasCpAccess (internal, tested via public methods)', () => {
    it('should return true when active grant exists', async () => {
      // Arrange — CP access granted (not revoked)
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        user_id: USER_ID,
        revoked_at: null,
      });
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.count.mockResolvedValue(0);

      // Act
      const result = await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, {});

      // Assert — query had no tier filter (all tiers included)
      const query = mockRlsTx.pastoralConcern.findMany.mock.calls[0][0];
      expect(query.where.tier).toBeUndefined();
      // CP access checked correctly
      expect(mockRlsTx.cpAccessGrant.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          revoked_at: null,
        },
      });
      expect(result.has_cp_records).toBe(false); // count was 0
    });

    it('should return false when no grant or revoked', async () => {
      // Arrange — no CP access
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, {});

      // Assert — tier filter restricted to 1, 2
      const query = mockRlsTx.pastoralConcern.findMany.mock.calls[0][0];
      expect(query.where.tier).toEqual({ in: [1, 2] });
      // CP record count was never called
      expect(mockRlsTx.cpRecord.count).not.toHaveBeenCalled();
      expect(result.has_cp_records).toBe(false);
    });
  });
});
