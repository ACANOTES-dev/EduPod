import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SenGoalService } from './sen-goal.service';
import { SenScopeService } from './sen-scope.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GOAL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STRATEGY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('SenGoalService', () => {
  let service: SenGoalService;

  const senSupportPlanMock = {
    findFirst: jest.fn(),
  };

  const senGoalMock = {
    aggregate: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const senGoalProgressMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };

  const senGoalStrategyMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockPrisma = {
    senSupportPlan: senSupportPlanMock,
    senGoal: senGoalMock,
    senGoalProgress: senGoalProgressMock,
    senGoalStrategy: senGoalStrategyMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SenGoalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SenScopeService, useValue: mockScopeService },
      ],
    }).compile();

    service = module.get<SenGoalService>(SenGoalService);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });

    jest.clearAllMocks();
    mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a goal using the next display order', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'draft' });
      senGoalMock.aggregate.mockResolvedValue({ _max: { display_order: 2 } });
      senGoalMock.create.mockResolvedValue({ id: GOAL_ID, display_order: 3 });

      const result = await service.create(TENANT_ID, PLAN_ID, {
        title: 'Phonics',
        target: 'Read 10 words',
        baseline: 'Reads 2 words',
        target_date: '2026-06-30',
      });

      expect(result).toEqual({ id: GOAL_ID, display_order: 3 });
      expect(senGoalMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            support_plan_id: PLAN_ID,
            display_order: 3,
            status: 'not_started',
          }),
        }),
      );
    });

    it('rejects goal creation when the parent plan is not editable', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'closed' });

      await expect(
        service.create(TENANT_ID, PLAN_ID, {
          title: 'Phonics',
          target: 'Read 10 words',
          baseline: 'Reads 2 words',
          target_date: '2026-06-30',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects goal creation when the parent plan is archived', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'archived' });

      await expect(
        service.create(TENANT_ID, PLAN_ID, {
          title: 'Phonics',
          target: 'Read 10 words',
          baseline: 'Reads 2 words',
          target_date: '2026-06-30',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllByPlan', () => {
    it('returns an empty list when the user has no scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(
        service.findAllByPlan(TENANT_ID, USER_ID, ['sen.view'], PLAN_ID, {}),
      ).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('updates the goal and returns the result', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({
        id: GOAL_ID,
        title: 'Updated title',
        target: 'New target',
      });

      const result = await service.update(TENANT_ID, GOAL_ID, {
        title: 'Updated title',
        target: 'New target',
      });

      expect(result).toEqual({
        id: GOAL_ID,
        title: 'Updated title',
        target: 'New target',
      });
      expect(senGoalMock.update).toHaveBeenCalledWith({
        where: { id: GOAL_ID },
        data: expect.objectContaining({
          title: 'Updated title',
          target: 'New target',
        }),
      });
    });

    it('throws when the goal does not exist', async () => {
      senGoalMock.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, GOAL_ID, { title: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transitionStatus', () => {
    it('records progress for partially_achieved / achieved / discontinued transitions', async () => {
      senGoalMock.findFirst.mockResolvedValue({
        id: GOAL_ID,
        status: 'in_progress',
      });
      senGoalMock.update.mockResolvedValue({
        id: GOAL_ID,
        status: 'achieved',
      });
      senGoalProgressMock.create.mockResolvedValue({ id: 'progress-id' });

      const result = await service.transitionStatus(
        TENANT_ID,
        GOAL_ID,
        {
          status: 'achieved',
          note: 'Target met consistently',
          current_level: 'Independent',
        },
        USER_ID,
      );

      expect(result).toEqual({
        id: GOAL_ID,
        status: 'achieved',
      });
      expect(senGoalProgressMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            goal_id: GOAL_ID,
            note: 'Target met consistently',
            recorded_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('rejects invalid transitions', async () => {
      senGoalMock.findFirst.mockResolvedValue({
        id: GOAL_ID,
        status: 'not_started',
      });

      await expect(
        service.transitionStatus(TENANT_ID, GOAL_ID, { status: 'achieved' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordProgress', () => {
    it('appends progress and updates current_level when provided', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalProgressMock.create.mockResolvedValue({ id: 'progress-id' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, current_level: 'Prompted' });

      const result = await service.recordProgress(
        TENANT_ID,
        GOAL_ID,
        { note: 'Needed fewer prompts', current_level: 'Prompted' },
        USER_ID,
      );

      expect(result).toEqual({ id: 'progress-id' });
      expect(senGoalMock.update).toHaveBeenCalledWith({
        where: { id: GOAL_ID },
        data: { current_level: 'Prompted' },
      });
    });
  });

  describe('findProgress', () => {
    it('returns paginated progress entries for accessible goals', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalProgressMock.findMany.mockResolvedValue([{ id: 'progress-id' }]);
      senGoalProgressMock.count.mockResolvedValue(1);

      const result = await service.findProgress(TENANT_ID, USER_ID, ['sen.view'], GOAL_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [{ id: 'progress-id' }],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });
  });

  describe('strategy CRUD', () => {
    it('creates and lists active strategies', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalStrategyMock.create.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.findMany.mockResolvedValue([{ id: STRATEGY_ID }]);

      const created = await service.createStrategy(TENANT_ID, GOAL_ID, {
        description: 'Daily practice',
      });
      const listed = await service.findStrategies(TENANT_ID, USER_ID, ['sen.view'], GOAL_ID);

      expect(created).toEqual({ id: STRATEGY_ID });
      expect(listed).toEqual([{ id: STRATEGY_ID }]);
      expect(senGoalStrategyMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            goal_id: GOAL_ID,
            is_active: true,
          }),
        }),
      );
    });

    it('updates and soft deletes a strategy', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.update
        .mockResolvedValueOnce({ id: STRATEGY_ID, description: 'Weekly review' })
        .mockResolvedValueOnce({ id: STRATEGY_ID, is_active: false });

      const updated = await service.updateStrategy(TENANT_ID, STRATEGY_ID, {
        description: 'Weekly review',
      });
      await service.deleteStrategy(TENANT_ID, STRATEGY_ID);

      expect(updated).toEqual({ id: STRATEGY_ID, description: 'Weekly review' });
      expect(senGoalStrategyMock.update).toHaveBeenLastCalledWith({
        where: { id: STRATEGY_ID },
        data: { is_active: false },
      });
    });

    it('throws when creating strategy for non-existent goal', async () => {
      senGoalMock.findFirst.mockResolvedValue(null);

      await expect(
        service.createStrategy(TENANT_ID, GOAL_ID, { description: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when updating non-existent strategy', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStrategy(TENANT_ID, STRATEGY_ID, { description: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when deleting non-existent strategy', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue(null);

      await expect(service.deleteStrategy(TENANT_ID, STRATEGY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create — additional', () => {
    it('throws when plan does not exist', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, PLAN_ID, {
          title: 'Goal',
          target: 'Target',
          baseline: 'Baseline',
          target_date: '2026-06-30',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows goal creation when plan status is active', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'active' });
      senGoalMock.aggregate.mockResolvedValue({ _max: { display_order: null } });
      senGoalMock.create.mockResolvedValue({ id: GOAL_ID, display_order: 0 });

      const result = await service.create(TENANT_ID, PLAN_ID, {
        title: 'Goal',
        target: 'Target',
        baseline: 'Baseline',
        target_date: '2026-06-30',
      });

      expect(result).toEqual({ id: GOAL_ID, display_order: 0 });
      expect(senGoalMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ display_order: 0 }),
        }),
      );
    });
  });

  describe('findAllByPlan — scope and filters', () => {
    it('applies class scope filter when fetching plan', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID });
      senGoalMock.findMany.mockResolvedValue([]);

      await service.findAllByPlan(TENANT_ID, USER_ID, ['sen.view'], PLAN_ID, {});

      expect(senSupportPlanMock.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sen_profile: {
              student_id: { in: ['student-1'] },
            },
          }),
        }),
      );
    });

    it('returns empty array when plan is not accessible in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senSupportPlanMock.findFirst.mockResolvedValue(null);

      const result = await service.findAllByPlan(TENANT_ID, USER_ID, ['sen.view'], PLAN_ID, {});

      expect(result).toEqual([]);
    });

    it('applies status filter when querying goals', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID });
      senGoalMock.findMany.mockResolvedValue([]);

      await service.findAllByPlan(TENANT_ID, USER_ID, ['sen.admin'], PLAN_ID, {
        status: 'in_progress',
      });

      expect(senGoalMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'in_progress' }),
        }),
      );
    });
  });

  describe('transitionStatus — additional', () => {
    it('throws when goal does not exist', async () => {
      senGoalMock.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, GOAL_ID, { status: 'in_progress' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not create progress for in_progress transition without note', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID, status: 'not_started' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, status: 'in_progress' });

      await service.transitionStatus(TENANT_ID, GOAL_ID, { status: 'in_progress' }, USER_ID);

      expect(senGoalProgressMock.create).not.toHaveBeenCalled();
    });

    it('creates progress for partially_achieved with note', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID, status: 'in_progress' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, status: 'partially_achieved' });
      senGoalProgressMock.create.mockResolvedValue({ id: 'progress-1' });

      await service.transitionStatus(
        TENANT_ID,
        GOAL_ID,
        { status: 'partially_achieved', note: 'Good progress' },
        USER_ID,
      );

      expect(senGoalProgressMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: 'Good progress',
            goal_id: GOAL_ID,
          }),
        }),
      );
    });

    it('creates progress for discontinued with note', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID, status: 'in_progress' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, status: 'discontinued' });
      senGoalProgressMock.create.mockResolvedValue({ id: 'progress-2' });

      await service.transitionStatus(
        TENANT_ID,
        GOAL_ID,
        { status: 'discontinued', note: 'No longer relevant' },
        USER_ID,
      );

      expect(senGoalProgressMock.create).toHaveBeenCalled();
    });
  });

  describe('recordProgress — additional', () => {
    it('throws when goal does not exist', async () => {
      senGoalMock.findFirst.mockResolvedValue(null);

      await expect(
        service.recordProgress(TENANT_ID, GOAL_ID, { note: 'Test' }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not update current_level when not provided in dto', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalProgressMock.create.mockResolvedValue({ id: 'progress-1' });

      await service.recordProgress(TENANT_ID, GOAL_ID, { note: 'Just a note' }, USER_ID);

      expect(senGoalMock.update).not.toHaveBeenCalled();
    });
  });

  describe('findProgress — scope', () => {
    it('throws when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(
        service.findProgress(TENANT_ID, USER_ID, ['sen.view'], GOAL_ID, {
          page: 1,
          pageSize: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when goal not accessible in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senGoalMock.findFirst.mockResolvedValue(null);

      await expect(
        service.findProgress(TENANT_ID, USER_ID, ['sen.view'], GOAL_ID, {
          page: 1,
          pageSize: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findStrategies — scope', () => {
    it('throws when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(
        service.findStrategies(TENANT_ID, USER_ID, ['sen.view'], GOAL_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Additional branch coverage ─────────────────────────────────────────────

  describe('update — nullable field branches', () => {
    it('should handle setting description to null', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, description: null });

      await service.update(TENANT_ID, GOAL_ID, {
        description: null,
      });

      expect(senGoalMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    it('should handle setting current_level to null', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, current_level: null });

      await service.update(TENANT_ID, GOAL_ID, {
        current_level: null,
      });

      expect(senGoalMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            current_level: null,
          }),
        }),
      );
    });

    it('should handle setting target_date as date string', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID });

      await service.update(TENANT_ID, GOAL_ID, {
        target_date: '2026-12-31',
      });

      expect(senGoalMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            target_date: new Date('2026-12-31'),
          }),
        }),
      );
    });

    it('should handle setting display_order', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, display_order: 5 });

      await service.update(TENANT_ID, GOAL_ID, {
        display_order: 5,
      });

      expect(senGoalMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            display_order: 5,
          }),
        }),
      );
    });

    it('should pass undefined for fields not present in dto', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID });

      await service.update(TENANT_ID, GOAL_ID, {
        title: 'Only title changed',
      });

      const updateArgs = senGoalMock.update.mock.calls[0]?.[0];
      expect(updateArgs?.data?.description).toBeUndefined();
      expect(updateArgs?.data?.current_level).toBeUndefined();
      expect(updateArgs?.data?.target_date).toBeUndefined();
      expect(updateArgs?.data?.display_order).toBeUndefined();
    });
  });

  describe('updateStrategy — nullable field branches', () => {
    it('should handle setting responsible_user_id to null', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.update.mockResolvedValue({ id: STRATEGY_ID });

      await service.updateStrategy(TENANT_ID, STRATEGY_ID, {
        responsible_user_id: null,
      });

      expect(senGoalStrategyMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsible_user_id: null,
          }),
        }),
      );
    });

    it('should handle setting frequency to null', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.update.mockResolvedValue({ id: STRATEGY_ID });

      await service.updateStrategy(TENANT_ID, STRATEGY_ID, {
        frequency: null,
      });

      expect(senGoalStrategyMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            frequency: null,
          }),
        }),
      );
    });

    it('should handle setting is_active to false', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.update.mockResolvedValue({ id: STRATEGY_ID, is_active: false });

      await service.updateStrategy(TENANT_ID, STRATEGY_ID, {
        is_active: false,
      });

      expect(senGoalStrategyMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_active: false,
          }),
        }),
      );
    });

    it('should pass undefined for fields not present in update dto', async () => {
      senGoalStrategyMock.findFirst.mockResolvedValue({ id: STRATEGY_ID });
      senGoalStrategyMock.update.mockResolvedValue({ id: STRATEGY_ID });

      await service.updateStrategy(TENANT_ID, STRATEGY_ID, {
        description: 'Only description',
      });

      const updateArgs = senGoalStrategyMock.update.mock.calls[0]?.[0];
      expect(updateArgs?.data?.responsible_user_id).toBeUndefined();
      expect(updateArgs?.data?.frequency).toBeUndefined();
      expect(updateArgs?.data?.is_active).toBeUndefined();
    });
  });

  describe('create — default values for optional fields', () => {
    it('should default description and current_level to null', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'draft' });
      senGoalMock.aggregate.mockResolvedValue({ _max: { display_order: 0 } });
      senGoalMock.create.mockResolvedValue({ id: GOAL_ID });

      await service.create(TENANT_ID, PLAN_ID, {
        title: 'Goal',
        target: 'Target',
        baseline: 'Baseline',
        target_date: '2026-06-30',
      });

      expect(senGoalMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
            current_level: null,
          }),
        }),
      );
    });

    it('should accept optional description and current_level', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID, status: 'active' });
      senGoalMock.aggregate.mockResolvedValue({ _max: { display_order: 1 } });
      senGoalMock.create.mockResolvedValue({ id: GOAL_ID });

      await service.create(TENANT_ID, PLAN_ID, {
        title: 'Goal',
        target: 'Target',
        baseline: 'Baseline',
        target_date: '2026-06-30',
        description: 'A detailed description',
        current_level: 'Independent',
      });

      expect(senGoalMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'A detailed description',
            current_level: 'Independent',
          }),
        }),
      );
    });
  });

  describe('transitionStatus — current_level handling', () => {
    it('should not update current_level when not provided in transition dto', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID, status: 'not_started' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, status: 'in_progress' });

      await service.transitionStatus(TENANT_ID, GOAL_ID, { status: 'in_progress' }, USER_ID);

      const updateArgs = senGoalMock.update.mock.calls[0]?.[0];
      expect(updateArgs?.data?.current_level).toBeUndefined();
    });

    it('should update current_level when provided in transition dto', async () => {
      senGoalMock.findFirst.mockResolvedValue({ id: GOAL_ID, status: 'not_started' });
      senGoalMock.update.mockResolvedValue({ id: GOAL_ID, status: 'in_progress' });

      await service.transitionStatus(
        TENANT_ID,
        GOAL_ID,
        { status: 'in_progress', current_level: 'Emerging' },
        USER_ID,
      );

      expect(senGoalMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            current_level: 'Emerging',
          }),
        }),
      );
    });
  });

  describe('findAllByPlan — all scope without status filter', () => {
    it('should return all goals without status filter', async () => {
      senSupportPlanMock.findFirst.mockResolvedValue({ id: PLAN_ID });
      senGoalMock.findMany.mockResolvedValue([{ id: GOAL_ID }]);

      const result = await service.findAllByPlan(TENANT_ID, USER_ID, ['sen.admin'], PLAN_ID, {});

      expect(result).toEqual([{ id: GOAL_ID }]);
      const whereArg = senGoalMock.findMany.mock.calls[0]?.[0]?.where;
      expect(whereArg?.status).toBeUndefined();
    });
  });
});
