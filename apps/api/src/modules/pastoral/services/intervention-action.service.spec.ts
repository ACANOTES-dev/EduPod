import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { InterventionActionService } from './intervention-action.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASSIGNED_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INTERVENTION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ACTION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralIntervention: {
    findFirst: jest.fn(),
  },
  pastoralInterventionAction: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeIntervention = (overrides: Record<string, unknown> = {}) => ({
  id: INTERVENTION_ID,
  tenant_id: TENANT_ID,
  status: 'pc_active',
  student_id: 'student-1',
  ...overrides,
});

const makeAction = (overrides: Record<string, unknown> = {}) => ({
  id: ACTION_ID,
  tenant_id: TENANT_ID,
  intervention_id: INTERVENTION_ID,
  description: 'Daily reading practice',
  assigned_to_user_id: ASSIGNED_USER_ID,
  frequency: 'once',
  start_date: new Date('2026-03-27'),
  due_date: new Date('2026-04-10'),
  completed_at: null,
  completed_by_user_id: null,
  status: 'pc_pending',
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  ...overrides,
});

const baseCreateDto = {
  intervention_id: INTERVENTION_ID,
  description: 'Daily reading practice',
  assigned_to_user_id: ASSIGNED_USER_ID,
  frequency: 'once' as const,
  start_date: '2026-03-27',
  due_date: '2026-04-10',
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('InterventionActionService', () => {
  let service: InterventionActionService;
  let mockEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterventionActionService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<InterventionActionService>(InterventionActionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createAction ───────────────────────────────────────────────────────

  describe('createAction', () => {
    it('should create action with valid data', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(makeIntervention());
      const action = makeAction();
      mockRlsTx.pastoralInterventionAction.create.mockResolvedValue(action);

      const result = await service.createAction(
        TENANT_ID,
        INTERVENTION_ID,
        baseCreateDto,
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(ACTION_ID);
      expect(mockRlsTx.pastoralInterventionAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          description: 'Daily reading practice',
          assigned_to_user_id: ASSIGNED_USER_ID,
          frequency: 'once',
          status: 'pc_pending',
        }),
      });
    });

    it('should reject when parent intervention is terminal', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(
        makeIntervention({ status: 'achieved' }),
      );

      await expect(
        service.createAction(TENANT_ID, INTERVENTION_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject when parent intervention is withdrawn', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(
        makeIntervention({ status: 'withdrawn' }),
      );

      await expect(
        service.createAction(TENANT_ID, INTERVENTION_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should require due_date when frequency=once', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(makeIntervention());

      await expect(
        service.createAction(
          TENANT_ID,
          INTERVENTION_ID,
          { ...baseCreateDto, frequency: 'once' as const, due_date: undefined },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow no due_date when frequency=weekly', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(makeIntervention());
      const action = makeAction({ frequency: 'weekly', due_date: null });
      mockRlsTx.pastoralInterventionAction.create.mockResolvedValue(action);

      const result = await service.createAction(
        TENANT_ID,
        INTERVENTION_ID,
        { ...baseCreateDto, frequency: 'weekly' as const, due_date: undefined },
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(ACTION_ID);
    });

    it('should emit action_assigned event', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(makeIntervention());
      mockRlsTx.pastoralInterventionAction.create.mockResolvedValue(makeAction());

      await service.createAction(TENANT_ID, INTERVENTION_ID, baseCreateDto, ACTOR_USER_ID);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'action_assigned',
          entity_type: 'intervention',
          payload: expect.objectContaining({
            action_id: ACTION_ID,
            source: 'intervention',
            intervention_id: INTERVENTION_ID,
            assigned_to_user_id: ASSIGNED_USER_ID,
          }),
        }),
      );
    });
  });

  // ─── updateAction ──────────────────────────────────────────────────────

  describe('updateAction', () => {
    it('should allow valid status transition: pending -> in_progress', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_pending' }),
      );
      const updated = makeAction({ status: 'pc_in_progress' });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(updated);

      const result = await service.updateAction(
        TENANT_ID,
        ACTION_ID,
        { status: 'in_progress' },
        ACTOR_USER_ID,
      );

      expect(result.status).toBe('pc_in_progress');
    });

    it('should allow valid status transition: in_progress -> completed', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_in_progress' }),
      );
      const updated = makeAction({
        status: 'pc_completed',
        completed_at: new Date(),
        completed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(updated);

      const result = await service.updateAction(
        TENANT_ID,
        ACTION_ID,
        { status: 'completed' },
        ACTOR_USER_ID,
      );

      expect(result.status).toBe('pc_completed');
    });

    it('should allow valid status transition: overdue -> in_progress', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_overdue' }),
      );
      const updated = makeAction({ status: 'pc_in_progress' });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(updated);

      const result = await service.updateAction(
        TENANT_ID,
        ACTION_ID,
        { status: 'in_progress' },
        ACTOR_USER_ID,
      );

      expect(result.status).toBe('pc_in_progress');
    });

    it('should reject invalid transition: completed -> pending', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_completed' }),
      );

      await expect(
        service.updateAction(
          TENANT_ID,
          ACTION_ID,
          { status: 'pending' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject invalid transition: cancelled -> in_progress', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_cancelled' }),
      );

      await expect(
        service.updateAction(
          TENANT_ID,
          ACTION_ID,
          { status: 'in_progress' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should set completed_at and completed_by when completing via update', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_pending' }),
      );
      const updated = makeAction({
        status: 'pc_completed',
        completed_at: new Date(),
        completed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(updated);

      await service.updateAction(
        TENANT_ID,
        ACTION_ID,
        { status: 'completed' },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralInterventionAction.update).toHaveBeenCalledWith({
        where: { id: ACTION_ID },
        data: expect.objectContaining({
          status: 'pc_completed',
          completed_at: expect.any(Date),
          completed_by_user_id: ACTOR_USER_ID,
        }),
      });
    });

    it('should emit action_completed event when completing', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_in_progress' }),
      );
      const updated = makeAction({ status: 'pc_completed' });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(updated);

      await service.updateAction(
        TENANT_ID,
        ACTION_ID,
        { status: 'completed' },
        ACTOR_USER_ID,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'action_completed',
          payload: expect.objectContaining({
            action_id: ACTION_ID,
            completed_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });
  });

  // ─── completeAction ─────────────────────────────────────────────────────

  describe('completeAction', () => {
    it('should set completed_at and completed_by_user_id', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_pending' }),
      );
      const completed = makeAction({
        status: 'pc_completed',
        completed_at: new Date(),
        completed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(completed);

      const result = await service.completeAction(TENANT_ID, ACTION_ID, ACTOR_USER_ID);

      expect(result.completed_by_user_id).toBe(ACTOR_USER_ID);
      expect(mockRlsTx.pastoralInterventionAction.update).toHaveBeenCalledWith({
        where: { id: ACTION_ID },
        data: {
          status: 'pc_completed',
          completed_at: expect.any(Date),
          completed_by_user_id: ACTOR_USER_ID,
        },
      });
    });

    it('should throw when already completed', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_completed' }),
      );

      await expect(
        service.completeAction(TENANT_ID, ACTION_ID, ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw when action is cancelled (terminal)', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_cancelled' }),
      );

      await expect(
        service.completeAction(TENANT_ID, ACTION_ID, ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should complete overdue action successfully', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_overdue' }),
      );
      const completed = makeAction({
        status: 'pc_completed',
        completed_at: new Date(),
        completed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(completed);

      const result = await service.completeAction(TENANT_ID, ACTION_ID, ACTOR_USER_ID);

      expect(result.status).toBe('pc_completed');
    });

    it('should emit action_completed event', async () => {
      mockRlsTx.pastoralInterventionAction.findFirst.mockResolvedValue(
        makeAction({ status: 'pc_pending' }),
      );
      mockRlsTx.pastoralInterventionAction.update.mockResolvedValue(
        makeAction({ status: 'pc_completed' }),
      );

      await service.completeAction(TENANT_ID, ACTION_ID, ACTOR_USER_ID);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'action_completed',
          payload: expect.objectContaining({
            action_id: ACTION_ID,
            completed_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });
  });

  // ─── listMyActions ──────────────────────────────────────────────────────

  describe('listMyActions', () => {
    it('should return only actions assigned to user', async () => {
      const myActions = [
        makeAction({ id: 'action-1', assigned_to_user_id: ACTOR_USER_ID }),
        makeAction({ id: 'action-2', assigned_to_user_id: ACTOR_USER_ID }),
      ];
      mockRlsTx.pastoralInterventionAction.findMany.mockResolvedValue(myActions);
      mockRlsTx.pastoralInterventionAction.count.mockResolvedValue(2);

      const result = await service.listMyActions(TENANT_ID, ACTOR_USER_ID);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockRlsTx.pastoralInterventionAction.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          assigned_to_user_id: ACTOR_USER_ID,
        }),
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should filter by status when provided', async () => {
      mockRlsTx.pastoralInterventionAction.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralInterventionAction.count.mockResolvedValue(0);

      await service.listMyActions(TENANT_ID, ACTOR_USER_ID, {
        status: 'pending',
        page: 1,
        pageSize: 20,
        sort: 'due_date',
        order: 'asc',
      });

      expect(mockRlsTx.pastoralInterventionAction.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          assigned_to_user_id: ACTOR_USER_ID,
          status: 'pc_pending',
        }),
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });

  // ─── listActionsForIntervention ─────────────────────────────────────────

  describe('listActionsForIntervention', () => {
    it('should return all actions for an intervention', async () => {
      const actions = [
        makeAction({ id: 'action-1' }),
        makeAction({ id: 'action-2' }),
      ];
      mockRlsTx.pastoralInterventionAction.findMany.mockResolvedValue(actions);

      const result = await service.listActionsForIntervention(TENANT_ID, INTERVENTION_ID);

      expect(result).toHaveLength(2);
      expect(mockRlsTx.pastoralInterventionAction.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, intervention_id: INTERVENTION_ID },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  // ─── listAllActions ─────────────────────────────────────────────────────

  describe('listAllActions', () => {
    it('should return paginated actions', async () => {
      const actions = [makeAction()];
      mockRlsTx.pastoralInterventionAction.findMany.mockResolvedValue(actions);
      mockRlsTx.pastoralInterventionAction.count.mockResolvedValue(1);

      const result = await service.listAllActions(TENANT_ID, { page: 1, pageSize: 20, sort: 'due_date', order: 'asc' });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should apply status filter', async () => {
      mockRlsTx.pastoralInterventionAction.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralInterventionAction.count.mockResolvedValue(0);

      await service.listAllActions(TENANT_ID, {
        status: 'overdue',
        page: 1,
        pageSize: 10,
        sort: 'due_date',
        order: 'asc',
      });

      expect(mockRlsTx.pastoralInterventionAction.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'pc_overdue',
        }),
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 10,
      });
    });
  });
});
