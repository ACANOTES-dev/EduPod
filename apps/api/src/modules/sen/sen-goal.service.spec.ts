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
  });
});
