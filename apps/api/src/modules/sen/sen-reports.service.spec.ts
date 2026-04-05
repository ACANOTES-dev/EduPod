import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SenReportsService } from './sen-reports.service';
import { SenResourceService } from './sen-resource.service';
import { SenScopeService } from './sen-scope.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('SenReportsService', () => {
  let service: SenReportsService;

  const mockAcademicReadFacade = {
    findYearById: jest.fn().mockResolvedValue(null),
  };

  const senProfileMock = {
    findMany: jest.fn(),
  };

  const senSupportPlanMock = {
    findMany: jest.fn(),
  };

  const senGoalMock = {
    findMany: jest.fn(),
  };

  const senProfessionalInvolvementMock = {
    findMany: jest.fn(),
  };

  const senSnaAssignmentMock = {
    count: jest.fn(),
  };

  const senAccommodationMock = {
    count: jest.fn(),
  };

  const mockPrisma = {
    senProfile: senProfileMock,
    senSupportPlan: senSupportPlanMock,
    senGoal: senGoalMock,
    senProfessionalInvolvement: senProfessionalInvolvementMock,
    senSnaAssignment: senSnaAssignmentMock,
    senAccommodation: senAccommodationMock,
  };

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  const mockResourceService = {
    getUtilisation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SenScopeService, useValue: mockScopeService },
        { provide: SenResourceService, useValue: mockResourceService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
      ],
    }).compile();

    service = module.get<SenReportsService>(SenReportsService);

    jest.clearAllMocks();
    mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
  });

  afterEach(() => jest.clearAllMocks());

  describe('getNcseReturn', () => {
    it('aggregates profile, resource, gender, and year-group data', async () => {
      mockAcademicReadFacade.findYearById.mockResolvedValue({ id: YEAR_ID, name: '2025/2026' });
      senProfileMock.findMany.mockResolvedValue([
        {
          primary_category: 'learning',
          support_level: 'school_support',
          student: {
            gender: 'male',
            year_group: { id: 'yg-1', name: 'First Year' },
          },
        },
        {
          primary_category: 'learning',
          support_level: 'school_support_plus',
          student: {
            gender: null,
            year_group: { id: 'yg-1', name: 'First Year' },
          },
        },
        {
          primary_category: 'asd',
          support_level: 'school_support',
          student: {
            gender: 'female',
            year_group: null,
          },
        },
      ]);
      mockResourceService.getUtilisation.mockResolvedValue({
        totals: {
          total_allocated_hours: 20,
          total_assigned_hours: 15,
          total_used_hours: 11,
        },
        bySource: [
          { source: 'seno', total_allocated_hours: 12 },
          { source: 'school', total_allocated_hours: 8 },
        ],
      });
      senSnaAssignmentMock.count.mockResolvedValue(2);
      senAccommodationMock.count.mockResolvedValue(4);

      const result = await service.getNcseReturn(TENANT_ID, { academic_year_id: YEAR_ID });

      expect(result.academic_year).toBe('2025/2026');
      expect(result.total_sen_students).toBe(3);
      expect(result.by_category).toEqual(
        expect.arrayContaining([
          { category: 'learning', count: 2 },
          { category: 'asd', count: 1 },
        ]),
      );
      expect(result.by_support_level).toEqual(
        expect.arrayContaining([
          { level: 'school_support', count: 2 },
          { level: 'school_support_plus', count: 1 },
        ]),
      );
      expect(result.by_year_group).toEqual(
        expect.arrayContaining([
          { year_group_id: 'yg-1', year_group_name: 'First Year', count: 2 },
          { year_group_id: 'unassigned', year_group_name: 'Unassigned', count: 1 },
        ]),
      );
      expect(result.by_gender).toEqual(
        expect.arrayContaining([
          { gender: 'male', count: 1 },
          { gender: 'female', count: 1 },
          { gender: 'unspecified', count: 1 },
        ]),
      );
      expect(result.resource_hours).toEqual({
        seno_allocated: 12,
        school_allocated: 8,
        total_assigned: 15,
        total_used: 11,
      });
      expect(result.sna_count).toBe(2);
      expect(result.accommodation_count).toBe(4);
    });

    it('handles an empty tenant without crashing', async () => {
      senProfileMock.findMany.mockResolvedValue([]);
      mockResourceService.getUtilisation.mockResolvedValue({
        totals: {
          total_allocated_hours: 0,
          total_assigned_hours: 0,
          total_used_hours: 0,
        },
        bySource: [],
      });
      senSnaAssignmentMock.count.mockResolvedValue(0);
      senAccommodationMock.count.mockResolvedValue(0);

      const result = await service.getNcseReturn(TENANT_ID, {});

      expect(result.academic_year).toBe('All years');
      expect(result.total_sen_students).toBe(0);
      expect(result.by_category).toEqual([]);
      expect(result.by_support_level).toEqual([]);
      expect(result.by_year_group).toEqual([]);
      expect(result.by_gender).toEqual([]);
    });
  });

  describe('getOverviewReport', () => {
    it('returns a current snapshot filtered by scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1', 'student-2'],
      });
      senProfileMock.findMany.mockResolvedValue([
        {
          primary_category: 'learning',
          support_level: 'school_support',
          student: {
            year_group: { id: 'yg-1', name: 'First Year' },
          },
        },
        {
          primary_category: 'asd',
          support_level: 'school_support_plus',
          student: {
            year_group: null,
          },
        },
      ]);

      const result = await service.getOverviewReport(TENANT_ID, USER_ID, ['sen.view'], {});

      expect(senProfileMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: { in: ['student-1', 'student-2'] },
          }),
        }),
      );
      expect(result.total_sen_students).toBe(2);
      expect(result.by_category).toEqual(
        expect.arrayContaining([
          { category: 'learning', count: 1 },
          { category: 'asd', count: 1 },
        ]),
      );
    });
  });

  describe('getPlanCompliance', () => {
    it('detects due plans, overdue plans, and stale goals', async () => {
      const futureReview = new Date();
      futureReview.setDate(futureReview.getDate() + 3);

      const overdueReview = new Date();
      overdueReview.setDate(overdueReview.getDate() - 2);

      const oldProgress = new Date();
      oldProgress.setDate(oldProgress.getDate() - 45);

      const recentProgress = new Date();
      recentProgress.setDate(recentProgress.getDate() - 5);

      mockAcademicReadFacade.findYearById.mockResolvedValue({ id: YEAR_ID, name: '2025/2026' });
      senSupportPlanMock.findMany
        .mockResolvedValueOnce([
          {
            id: 'plan-due',
            plan_number: 'SSP-001',
            next_review_date: futureReview,
            status: 'draft',
            sen_profile: {
              id: 'profile-1',
              student: {
                id: 'student-1',
                first_name: 'Ava',
                last_name: 'Doyle',
                year_group: { id: 'yg-1', name: 'First Year' },
              },
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'plan-overdue',
            plan_number: 'SSP-002',
            next_review_date: overdueReview,
            status: 'active',
            sen_profile: {
              id: 'profile-2',
              student: {
                id: 'student-2',
                first_name: 'Ben',
                last_name: 'Kelly',
                year_group: { id: 'yg-2', name: 'Second Year' },
              },
            },
          },
        ]);
      senGoalMock.findMany.mockResolvedValue([
        {
          id: 'goal-1',
          title: 'Reading fluency',
          status: 'in_progress',
          progress_notes: [],
          support_plan: {
            id: 'plan-1',
            plan_number: 'SSP-001',
            next_review_date: futureReview,
            sen_profile: {
              student: {
                id: 'student-1',
                first_name: 'Ava',
                last_name: 'Doyle',
                year_group: { id: 'yg-1', name: 'First Year' },
              },
            },
          },
        },
        {
          id: 'goal-2',
          title: 'Organisation skills',
          status: 'in_progress',
          progress_notes: [{ created_at: oldProgress }],
          support_plan: {
            id: 'plan-2',
            plan_number: 'SSP-002',
            next_review_date: overdueReview,
            sen_profile: {
              student: {
                id: 'student-2',
                first_name: 'Ben',
                last_name: 'Kelly',
                year_group: { id: 'yg-2', name: 'Second Year' },
              },
            },
          },
        },
        {
          id: 'goal-3',
          title: 'Recent progress',
          status: 'in_progress',
          progress_notes: [{ created_at: recentProgress }],
          support_plan: {
            id: 'plan-3',
            plan_number: 'SSP-003',
            next_review_date: futureReview,
            sen_profile: {
              student: {
                id: 'student-3',
                first_name: 'Cara',
                last_name: 'Nolan',
                year_group: null,
              },
            },
          },
        },
      ]);

      const result = await service.getPlanCompliance(TENANT_ID, USER_ID, ['sen.view'], {
        academic_year_id: YEAR_ID,
        overdue: true,
        due_within_days: 14,
        stale_goal_weeks: 4,
      });

      expect(result.due_for_review).toHaveLength(1);
      expect(result.overdue_plans).toHaveLength(1);
      expect(result.stale_goals).toHaveLength(2);
      expect(result.stale_goals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ goal_id: 'goal-1', last_progress_at: null }),
          expect.objectContaining({ goal_id: 'goal-2', last_progress_at: oldProgress }),
        ]),
      );
    });

    it('returns empty overdue_plans and skips overdue query when overdue is false', async () => {
      senSupportPlanMock.findMany.mockResolvedValueOnce([]);
      senGoalMock.findMany.mockResolvedValue([]);

      const result = await service.getPlanCompliance(TENANT_ID, USER_ID, ['sen.view'], {
        overdue: false,
        due_within_days: 14,
        stale_goal_weeks: 4,
      });

      expect(result.overdue_plans).toEqual([]);
      // Only one senSupportPlan.findMany call (due plans), not two
      expect(senSupportPlanMock.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProfessionalInvolvementReport', () => {
    it('groups involvement counts by professional type and status', async () => {
      senProfessionalInvolvementMock.findMany.mockResolvedValue([
        { professional_type: 'speech_therapist', status: 'pending' },
        { professional_type: 'speech_therapist', status: 'scheduled' },
        { professional_type: 'speech_therapist', status: 'report_received' },
        { professional_type: 'educational_psychologist', status: 'completed' },
      ]);

      const result = await service.getProfessionalInvolvementReport(TENANT_ID);

      expect(result.summary).toEqual({
        total_involvements: 4,
        pending_referrals: 2,
        completed_assessments: 1,
        reports_received: 1,
      });
      expect(result.by_professional_type).toEqual(
        expect.arrayContaining([
          { professional_type: 'speech_therapist', count: 3 },
          { professional_type: 'educational_psychologist', count: 1 },
        ]),
      );
      expect(result.by_status).toEqual(
        expect.arrayContaining([
          { status: 'pending', count: 1 },
          { status: 'scheduled', count: 1 },
          { status: 'completed', count: 1 },
          { status: 'report_received', count: 1 },
        ]),
      );
    });

    it('handles grouped counts with same professional_type and status', async () => {
      senProfessionalInvolvementMock.findMany.mockResolvedValue([
        { professional_type: 'speech_therapist', status: 'pending' },
        { professional_type: 'speech_therapist', status: 'pending' },
      ]);

      const result = await service.getProfessionalInvolvementReport(TENANT_ID);

      expect(result.grouped_counts).toEqual(
        expect.arrayContaining([
          { professional_type: 'speech_therapist', status: 'pending', count: 2 },
        ]),
      );
    });

    it('handles empty involvement list', async () => {
      senProfessionalInvolvementMock.findMany.mockResolvedValue([]);

      const result = await service.getProfessionalInvolvementReport(TENANT_ID);

      expect(result.summary.total_involvements).toBe(0);
      expect(result.summary.pending_referrals).toBe(0);
      expect(result.by_professional_type).toEqual([]);
      expect(result.by_status).toEqual([]);
    });
  });

  // ─── Additional branch coverage ─────────────────────────────────────────────

  describe('getOverviewReport — scope branches', () => {
    it('returns empty result when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.getOverviewReport(TENANT_ID, USER_ID, [], {});

      expect(result.total_sen_students).toBe(0);
      expect(result.by_category).toEqual([]);
      expect(result.by_support_level).toEqual([]);
      expect(result.by_year_group).toEqual([]);
    });

    it('aggregates profiles without applying scope filter for "all" scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      senProfileMock.findMany.mockResolvedValue([
        {
          primary_category: 'learning',
          support_level: 'school_support',
          student: {
            year_group: { id: 'yg-1', name: 'First Year' },
          },
        },
      ]);

      const result = await service.getOverviewReport(TENANT_ID, USER_ID, ['sen.admin'], {});

      expect(result.total_sen_students).toBe(1);
      expect(senProfileMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('handles profiles with null year groups in overview', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      senProfileMock.findMany.mockResolvedValue([
        {
          primary_category: 'asd',
          support_level: 'school_support_plus',
          student: {
            year_group: null,
          },
        },
      ]);

      const result = await service.getOverviewReport(TENANT_ID, USER_ID, ['sen.admin'], {});

      expect(result.total_sen_students).toBe(1);
      expect(result.by_year_group).toEqual([
        { year_group_id: 'unassigned', year_group_name: 'Unassigned', count: 1 },
      ]);
    });
  });

  describe('getPlanCompliance — scope branches', () => {
    it('returns empty result when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.getPlanCompliance(TENANT_ID, USER_ID, [], {
        due_within_days: 14,
        stale_goal_weeks: 4,
      });

      expect(result.due_for_review).toEqual([]);
      expect(result.overdue_plans).toEqual([]);
      expect(result.stale_goals).toEqual([]);
    });

    it('throws NotFoundException when academic_year_id does not exist', async () => {
      mockAcademicReadFacade.findYearById.mockResolvedValue(null);

      await expect(
        service.getPlanCompliance(TENANT_ID, USER_ID, ['sen.view'], {
          academic_year_id: 'non-existent',
          due_within_days: 14,
          stale_goal_weeks: 4,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies class scope filter in plan compliance queries', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senSupportPlanMock.findMany.mockResolvedValue([]);
      senGoalMock.findMany.mockResolvedValue([]);

      const result = await service.getPlanCompliance(TENANT_ID, USER_ID, ['sen.view'], {
        due_within_days: 14,
        stale_goal_weeks: 4,
      });

      expect(result.due_for_review).toEqual([]);
      expect(senSupportPlanMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sen_profile: {
              student_id: { in: ['student-1'] },
            },
          }),
        }),
      );
    });
  });

  describe('getResourceUtilisation', () => {
    it('delegates to senResourceService.getUtilisation', async () => {
      const mockResult = {
        totals: { total_allocated_hours: 10, total_assigned_hours: 5, total_used_hours: 2 },
        bySource: [],
        byYearGroup: [],
      };
      mockResourceService.getUtilisation.mockResolvedValue(mockResult);

      const result = await service.getResourceUtilisation(TENANT_ID, {
        academic_year_id: YEAR_ID,
      });

      expect(result).toEqual(mockResult);
      expect(mockResourceService.getUtilisation).toHaveBeenCalledWith(TENANT_ID, {
        academic_year_id: YEAR_ID,
      });
    });
  });

  describe('getNcseReturn — additional branches', () => {
    it('returns "All years" when no academic_year_id provided', async () => {
      senProfileMock.findMany.mockResolvedValue([]);
      mockResourceService.getUtilisation.mockResolvedValue({
        totals: { total_allocated_hours: 0, total_assigned_hours: 0, total_used_hours: 0 },
        bySource: [],
      });
      senSnaAssignmentMock.count.mockResolvedValue(0);
      senAccommodationMock.count.mockResolvedValue(0);

      const result = await service.getNcseReturn(TENANT_ID, {});

      expect(result.academic_year).toBe('All years');
    });

    it('throws NotFoundException for non-existent academic year', async () => {
      mockAcademicReadFacade.findYearById.mockResolvedValue(null);

      await expect(
        service.getNcseReturn(TENANT_ID, { academic_year_id: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('handles profiles with null student (edge case)', async () => {
      senProfileMock.findMany.mockResolvedValue([
        {
          primary_category: 'learning',
          support_level: 'school_support',
          student: null,
        },
      ]);
      mockResourceService.getUtilisation.mockResolvedValue({
        totals: { total_allocated_hours: 0, total_assigned_hours: 0, total_used_hours: 0 },
        bySource: [],
      });
      senSnaAssignmentMock.count.mockResolvedValue(0);
      senAccommodationMock.count.mockResolvedValue(0);

      const result = await service.getNcseReturn(TENANT_ID, {});

      expect(result.total_sen_students).toBe(1);
      expect(result.by_gender).toEqual([{ gender: 'unspecified', count: 1 }]);
      expect(result.by_year_group).toEqual([
        { year_group_id: 'unassigned', year_group_name: 'Unassigned', count: 1 },
      ]);
    });

    it('defaults resource sources to 0 when not in bySource', async () => {
      senProfileMock.findMany.mockResolvedValue([]);
      mockResourceService.getUtilisation.mockResolvedValue({
        totals: { total_allocated_hours: 0, total_assigned_hours: 0, total_used_hours: 0 },
        bySource: [],
      });
      senSnaAssignmentMock.count.mockResolvedValue(0);
      senAccommodationMock.count.mockResolvedValue(0);

      const result = await service.getNcseReturn(TENANT_ID, {});

      expect(result.resource_hours.seno_allocated).toBe(0);
      expect(result.resource_hours.school_allocated).toBe(0);
    });
  });
});
