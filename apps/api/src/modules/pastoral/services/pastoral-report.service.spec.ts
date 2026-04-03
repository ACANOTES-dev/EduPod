import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralReportDesInspectionService } from './pastoral-report-des-inspection.service';
import { PastoralReportSafeguardingService } from './pastoral-report-safeguarding.service';
import { PastoralReportSstActivityService } from './pastoral-report-sst-activity.service';
import { PastoralReportStudentSummaryService } from './pastoral-report-student-summary.service';
import { PastoralReportWellbeingService } from './pastoral-report-wellbeing.service';
import { PastoralReportService } from './pastoral-report.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── RLS Mock ───────────────────────────────────────────────────────────────
// The delegate service opens an RLS transaction; the tx handle is passed to sub-services.

const mockRlsTx = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('PastoralReportService', () => {
  let service: PastoralReportService;
  let mockStudentSummaryService: { build: jest.Mock };
  let mockSstActivityService: { build: jest.Mock };
  let mockSafeguardingService: { build: jest.Mock };
  let mockWellbeingService: { build: jest.Mock };
  let mockDesInspectionService: { build: jest.Mock };

  beforeEach(async () => {
    mockStudentSummaryService = { build: jest.fn() };
    mockSstActivityService = { build: jest.fn() };
    mockSafeguardingService = { build: jest.fn() };
    mockWellbeingService = { build: jest.fn() };
    mockDesInspectionService = { build: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralReportStudentSummaryService, useValue: mockStudentSummaryService },
        { provide: PastoralReportSstActivityService, useValue: mockSstActivityService },
        { provide: PastoralReportSafeguardingService, useValue: mockSafeguardingService },
        { provide: PastoralReportWellbeingService, useValue: mockWellbeingService },
        { provide: PastoralReportDesInspectionService, useValue: mockDesInspectionService },
      ],
    }).compile();

    service = module.get<PastoralReportService>(PastoralReportService);
  });

  // ─── getStudentSummary ──────────────────────────────────────────────────

  describe('getStudentSummary', () => {
    it('should delegate to PastoralReportStudentSummaryService.build', async () => {
      const expectedResult = {
        student: { id: STUDENT_ID, full_name: 'Alice Smith', student_number: 'STU-001', year_group: 'Year 5', class_name: '5A' },
        concerns: [],
        cases: [],
        interventions: [],
        referrals: [],
        has_cp_records: false,
      };
      mockStudentSummaryService.build.mockResolvedValue(expectedResult);

      const result = await service.getStudentSummary(TENANT_ID, USER_ID, STUDENT_ID, { include_resolved: true });

      expect(mockStudentSummaryService.build).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        { include_resolved: true },
      );
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── getSstActivity ───────────────────────────────────────────────────────

  describe('getSstActivity', () => {
    it('should delegate to PastoralReportSstActivityService.build', async () => {
      const expectedResult = {
        period: { from: '2026-01-01', to: '2026-03-31' },
        cases_opened: 5,
        cases_closed: 2,
        cases_by_severity: { tier_1: 3 },
        avg_resolution_days: 14,
        concern_volume: { total: 10, by_category: {}, by_severity: {}, weekly_trend: [] },
        intervention_outcomes: { achieved: 1, partially_achieved: 0, not_achieved: 0, escalated: 0, in_progress: 2 },
        action_completion_rate: 67,
        overdue_actions: 1,
        by_year_group: [],
      };
      mockSstActivityService.build.mockResolvedValue(expectedResult);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-31' };
      const result = await service.getSstActivity(TENANT_ID, USER_ID, filters);

      expect(mockSstActivityService.build).toHaveBeenCalledWith(mockRlsTx, TENANT_ID, USER_ID, filters);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── getSafeguardingCompliance ────────────────────────────────────────────

  describe('getSafeguardingCompliance', () => {
    it('should delegate to PastoralReportSafeguardingService.build', async () => {
      const expectedResult = {
        period: { from: '2026-01-01', to: '2026-03-31' },
        concern_counts: { tier_1: 10, tier_2: 5, tier_3: null },
        mandated_reports: null,
        training_compliance: {
          dlp_name: 'Not configured', dlp_training_date: null,
          deputy_dlp_name: 'Not configured', deputy_dlp_training_date: null,
          staff_trained_count: 0, staff_total_count: 20, staff_compliance_rate: 0,
          non_compliant_staff: [],
        },
        child_safeguarding_statement: { last_review_date: null, next_review_due: null, board_signed_off: false },
        active_cp_cases: null,
      };
      mockSafeguardingService.build.mockResolvedValue(expectedResult);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-31' };
      const result = await service.getSafeguardingCompliance(TENANT_ID, USER_ID, filters);

      expect(mockSafeguardingService.build).toHaveBeenCalledWith(mockRlsTx, TENANT_ID, USER_ID, filters);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── getWellbeingProgramme ────────────────────────────────────────────────

  describe('getWellbeingProgramme', () => {
    it('should delegate to PastoralReportWellbeingService.build', async () => {
      const expectedResult = {
        period: { from: '2026-01-01', to: '2026-03-31' },
        intervention_coverage_percent: 15,
        continuum_distribution: { level_1: 1, level_2: 1, level_3: 1 },
        referral_rate: 10,
        concern_to_case_conversion_rate: 16,
        intervention_type_distribution: { mentoring: 2, counselling: 1 },
        by_year_group: [],
      };
      mockWellbeingService.build.mockResolvedValue(expectedResult);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-31' };
      const result = await service.getWellbeingProgramme(TENANT_ID, USER_ID, filters);

      expect(mockWellbeingService.build).toHaveBeenCalledWith(mockRlsTx, TENANT_ID, USER_ID, filters);
      expect(result).toEqual(expectedResult);
    });
  });

  // ─── getDesInspection ─────────────────────────────────────────────────────

  describe('getDesInspection', () => {
    it('should delegate to PastoralReportDesInspectionService.build', async () => {
      const expectedResult = {
        period: { from: '2026-01-01', to: '2026-03-31' },
        pastoral_care_policy_summary: 'Policy summary',
        sst_composition: [{ user_name: 'Alice DLP', role: 'DLP' }],
        meeting_frequency: { total_meetings: 3, average_per_month: 1 },
        concern_logging: { total: 3, by_category: { academic: 2, bullying: 1 } },
        intervention_quality: { with_measurable_targets_percent: 67, with_documented_outcomes_percent: 67 },
        referral_pathways: { total: 3, by_type: { neps: 2, camhs: 1 } },
        continuum_coverage: { level_1: 1, level_2: 1, level_3: 1 },
        staff_engagement: { distinct_staff_logging_concerns: 2 },
      };
      mockDesInspectionService.build.mockResolvedValue(expectedResult);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-31' };
      const result = await service.getDesInspection(TENANT_ID, USER_ID, filters);

      expect(mockDesInspectionService.build).toHaveBeenCalledWith(mockRlsTx, TENANT_ID, USER_ID, filters);
      expect(result).toEqual(expectedResult);
    });
  });
});
