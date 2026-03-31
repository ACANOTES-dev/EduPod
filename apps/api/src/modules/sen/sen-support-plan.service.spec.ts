import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { SenScopeService } from './sen-scope.service';
import { SenSupportPlanService } from './sen-support-plan.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const GOAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STRATEGY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('SenSupportPlanService', () => {
  let service: SenSupportPlanService;

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const senSupportPlanMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };

  const senGoalMock = {
    create: jest.fn(),
  };

  const senGoalStrategyMock = {
    create: jest.fn(),
  };

  const mockPrisma = {
    senProfile: senProfileMock,
    senSupportPlan: senSupportPlanMock,
    senGoal: senGoalMock,
    senGoalStrategy: senGoalStrategyMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockSequenceService = {
    nextNumber: jest.fn(),
  };

  const mockSettingsService = {
    getModuleSettings: jest.fn(),
  };

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SenSupportPlanService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SenScopeService, useValue: mockScopeService },
      ],
    }).compile();

    service = module.get<SenSupportPlanService>(SenSupportPlanService);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });

    jest.clearAllMocks();
    mockSettingsService.getModuleSettings.mockResolvedValue({
      plan_number_prefix: 'SSP',
      default_review_cycle_weeks: 12,
    });
    mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a support plan with a generated plan number', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockSequenceService.nextNumber.mockResolvedValue('SSP-202603-000001');
      const createdPlan = { id: PLAN_ID, plan_number: 'SSP-202603-000001' };
      senSupportPlanMock.create.mockResolvedValue(createdPlan);

      const result = await service.create(
        TENANT_ID,
        PROFILE_ID,
        { academic_year_id: 'year-id', parent_input: 'Parent input' },
        USER_ID,
      );

      expect(result).toEqual(createdPlan);
      expect(mockSettingsService.getModuleSettings).toHaveBeenCalledWith(TENANT_ID, 'sen');
      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'sen_support_plan',
        mockPrisma,
        'SSP',
      );
      expect(senSupportPlanMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sen_profile_id: PROFILE_ID,
            created_by_user_id: USER_ID,
            version: 1,
            status: 'draft',
          }),
        }),
      );
    });

    it('throws when the SEN profile does not exist', async () => {
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, PROFILE_ID, { academic_year_id: 'year-id' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllByProfile', () => {
    it('returns empty results when the user has no SEN scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findAllByProfile(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it('returns scoped plans for a profile', async () => {
      const plans = [{ id: PLAN_ID, version: 2 }];
      senSupportPlanMock.findMany.mockResolvedValue(plans);
      senSupportPlanMock.count.mockResolvedValue(1);

      const result = await service.findAllByProfile(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID, {
        page: 1,
        pageSize: 20,
        status: 'draft',
      });

      expect(result.data).toEqual(plans);
      expect(senSupportPlanMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            sen_profile_id: PROFILE_ID,
            status: 'draft',
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a plan detail when the user can access it', async () => {
      const detail = {
        id: PLAN_ID,
        goals: [{ id: GOAL_ID, strategies: [], progress_notes: [] }],
      };
      senSupportPlanMock.findFirst.mockResolvedValue(detail);

      const result = await service.findOne(TENANT_ID, USER_ID, ['sen.view'], PLAN_ID);

      expect(result).toEqual(detail);
    });

    it('throws when a class-scoped user cannot access the plan', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senSupportPlanMock.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, USER_ID, ['sen.view'], PLAN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transitionStatus', () => {
    it('applies review initiation side effects for active -> under_review', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({
        id: PLAN_ID,
        status: 'active',
      });
      senSupportPlanMock.update.mockResolvedValue({
        id: PLAN_ID,
        status: 'under_review',
      });

      const result = await service.transitionStatus(
        TENANT_ID,
        PLAN_ID,
        { status: 'under_review', review_notes: 'Review started' },
        USER_ID,
      );

      expect(result).toEqual({
        id: PLAN_ID,
        status: 'under_review',
      });
      expect(senSupportPlanMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'under_review',
            review_notes: 'Review started',
            reviewed_by: { connect: { id: USER_ID } },
          }),
        }),
      );
    });

    it('applies next review date side effects for draft -> active', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-31T09:00:00.000Z'));

      senSupportPlanMock.findFirst.mockResolvedValue({
        id: PLAN_ID,
        status: 'draft',
      });
      senSupportPlanMock.update.mockResolvedValue({
        id: PLAN_ID,
        status: 'active',
      });

      await service.transitionStatus(TENANT_ID, PLAN_ID, { status: 'active' }, USER_ID);

      expect(mockSettingsService.getModuleSettings).toHaveBeenCalledWith(TENANT_ID, 'sen');
      expect(senSupportPlanMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'active',
            next_review_date: new Date('2026-06-23T09:00:00.000Z'),
          }),
        }),
      );

      jest.useRealTimers();
    });

    it('clears review state and sets next_review_date for under_review -> active', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-31T09:00:00.000Z'));

      senSupportPlanMock.findFirst.mockResolvedValue({
        id: PLAN_ID,
        status: 'under_review',
        review_date: new Date('2026-03-15'),
        reviewed_by_user_id: USER_ID,
        review_notes: 'Some review notes',
      });
      senSupportPlanMock.update.mockResolvedValue({
        id: PLAN_ID,
        status: 'active',
      });

      const result = await service.transitionStatus(
        TENANT_ID,
        PLAN_ID,
        { status: 'active' },
        USER_ID,
      );

      expect(result).toEqual({ id: PLAN_ID, status: 'active' });
      expect(mockSettingsService.getModuleSettings).toHaveBeenCalledWith(TENANT_ID, 'sen');
      expect(senSupportPlanMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'active',
            review_date: null,
            reviewed_by: { disconnect: true },
            review_notes: null,
            next_review_date: new Date('2026-06-23T09:00:00.000Z'),
          }),
        }),
      );

      jest.useRealTimers();
    });

    it('applies no side effects for closed -> archived', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({
        id: PLAN_ID,
        status: 'closed',
      });
      senSupportPlanMock.update.mockResolvedValue({
        id: PLAN_ID,
        status: 'archived',
      });

      const result = await service.transitionStatus(
        TENANT_ID,
        PLAN_ID,
        { status: 'archived' },
        USER_ID,
      );

      expect(result).toEqual({ id: PLAN_ID, status: 'archived' });
      expect(senSupportPlanMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'archived' },
        }),
      );
    });

    it('rejects invalid support plan transitions', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({
        id: PLAN_ID,
        status: 'draft',
      });

      await expect(
        service.transitionStatus(TENANT_ID, PLAN_ID, { status: 'closed' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('clone', () => {
    it('clones goals and active strategies into a new draft plan', async () => {
      mockSequenceService.nextNumber.mockResolvedValue('SSP-202603-000002');
      senSupportPlanMock.findFirst
        .mockResolvedValueOnce({
          id: PLAN_ID,
          sen_profile_id: PROFILE_ID,
          version: 2,
          parent_input: 'Parent',
          student_voice: 'Student',
          staff_notes: 'Staff',
          goals: [
            {
              id: GOAL_ID,
              title: 'Reading',
              description: 'Goal description',
              target: 'Target',
              baseline: 'Baseline',
              current_level: 'Current',
              target_date: new Date('2026-06-30'),
              display_order: 0,
              strategies: [
                {
                  id: STRATEGY_ID,
                  description: 'Daily intervention',
                  responsible_user_id: USER_ID,
                  frequency: 'daily',
                },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'new-plan',
          goals: [{ id: 'new-goal' }],
        });
      senSupportPlanMock.create.mockResolvedValue({ id: 'new-plan' });
      senGoalMock.create.mockResolvedValue({ id: 'new-goal' });
      senGoalStrategyMock.create.mockResolvedValue({ id: 'new-strategy' });

      const result = await service.clone(
        TENANT_ID,
        PLAN_ID,
        { academic_year_id: 'next-year-id' },
        USER_ID,
      );

      expect(result).toEqual({ id: 'new-plan', goals: [{ id: 'new-goal' }] });
      expect(senSupportPlanMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parent_version_id: PLAN_ID,
            version: 3,
            status: 'draft',
          }),
        }),
      );
      expect(senGoalMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            support_plan_id: 'new-plan',
            status: 'not_started',
            current_level: null,
          }),
        }),
      );
      expect(senGoalStrategyMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            goal_id: 'new-goal',
            description: 'Daily intervention',
          }),
        }),
      );
    });

    it('throws when the source plan does not exist', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue(null);

      await expect(
        service.clone(TENANT_ID, PLAN_ID, { academic_year_id: 'next-year-id' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
