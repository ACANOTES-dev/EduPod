import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';
import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Mock Types ──────────────────────────────────────────────────────────────

interface MockTx {
  behaviourGuardianRestriction: {
    count: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  behaviourTask: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  behaviourEntityHistory: {
    create: jest.Mock;
  };
}

interface MockPrisma {
  behaviourGuardianRestriction: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  behaviourTask: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  behaviourEntityHistory: {
    create: jest.Mock;
  };
  $extends: jest.Mock;
}

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx: MockTx = {
  behaviourGuardianRestriction: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourTask: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BehaviourGuardianRestrictionsService', () => {
  let service: BehaviourGuardianRestrictionsService;
  let mockTx: MockTx;
  let mockPrisma: MockPrisma;
  let mockHistoryService: { recordHistory: jest.Mock; getHistory: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
  const PARENT_ID = '33333333-3333-3333-3333-333333333333';
  const RESTRICTION_ID = '44444444-4444-4444-4444-444444444444';
  const SET_BY_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    mockTx = {
      behaviourGuardianRestriction: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      behaviourTask: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      behaviourEntityHistory: {
        create: jest.fn(),
      },
    };

    // Reset RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    mockPrisma = {
      behaviourGuardianRestriction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      behaviourTask: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      behaviourEntityHistory: {
        create: jest.fn(),
      },
      $extends: jest.fn(),
    };

    mockHistoryService = {
      recordHistory: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({ data: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourGuardianRestrictionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
      ],
    }).compile();

    service = module.get<BehaviourGuardianRestrictionsService>(
      BehaviourGuardianRestrictionsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── hasActiveRestriction ────────────────────────────────────────────────

  describe('hasActiveRestriction', () => {
    it('should return true when active restriction matches effective date range', async () => {
      mockTx.behaviourGuardianRestriction.count.mockResolvedValue(1);

      const result = await service.hasActiveRestriction(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        PARENT_ID,
        ['no_contact', 'no_pickup'],
      );

      expect(result).toBe(true);
      expect(mockTx.behaviourGuardianRestriction.count).toHaveBeenCalledTimes(1);

      const callArgs = mockTx.behaviourGuardianRestriction.count.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      const where = callArgs[0].where;

      expect(where).toMatchObject({
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        status: 'active_restriction',
      });
    });

    it('should return false when restriction.effective_until < today', async () => {
      // Prisma filter excludes expired date ranges, so count returns 0
      mockTx.behaviourGuardianRestriction.count.mockResolvedValue(0);

      const result = await service.hasActiveRestriction(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        PARENT_ID,
        ['no_contact'],
      );

      expect(result).toBe(false);
    });

    it('should return false when restriction.effective_from > today', async () => {
      // Prisma filter requires effective_from <= today, so count returns 0
      mockTx.behaviourGuardianRestriction.count.mockResolvedValue(0);

      const result = await service.hasActiveRestriction(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        PARENT_ID,
        ['no_pickup'],
      );

      expect(result).toBe(false);
    });

    it('should return false when restriction.status = expired', async () => {
      // Prisma filter only matches status = active_restriction, so count returns 0
      mockTx.behaviourGuardianRestriction.count.mockResolvedValue(0);

      const result = await service.hasActiveRestriction(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        STUDENT_ID,
        PARENT_ID,
        ['no_contact'],
      );

      expect(result).toBe(false);
      expect(mockTx.behaviourGuardianRestriction.count).toHaveBeenCalledTimes(1);

      const callArgs = mockTx.behaviourGuardianRestriction.count.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(callArgs[0].where).toHaveProperty('status', 'active_restriction');
    });
  });

  // ─── createReviewReminders ───────────────────────────────────────────────

  describe('createReviewReminders', () => {
    it('should create review task when review_date is within 14 days', async () => {
      const today = '2026-03-26';
      const reviewDate = new Date('2026-04-05'); // 10 days away

      mockTx.behaviourGuardianRestriction.findMany.mockResolvedValue([
        {
          id: RESTRICTION_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
          status: 'active_restriction',
          review_date: reviewDate,
          set_by_id: SET_BY_ID,
        },
      ]);
      mockTx.behaviourTask.findFirst.mockResolvedValue(null);
      mockTx.behaviourTask.create.mockResolvedValue({ id: 'new-task-id' });

      const result = await service.createReviewReminders(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        today,
      );

      expect(result).toBe(1);
      expect(mockTx.behaviourTask.create).toHaveBeenCalledTimes(1);

      const createArgs = mockTx.behaviourTask.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createArgs[0].data).toMatchObject({
        tenant_id: TENANT_ID,
        task_type: 'guardian_restriction_review',
        entity_type: 'guardian_restriction',
        entity_id: RESTRICTION_ID,
        priority: 'medium',
        status: 'pending',
        assigned_to_id: SET_BY_ID,
        due_date: reviewDate,
      });
    });

    it('should not create duplicate review task', async () => {
      const today = '2026-03-26';
      const reviewDate = new Date('2026-04-05'); // 10 days away

      mockTx.behaviourGuardianRestriction.findMany.mockResolvedValue([
        {
          id: RESTRICTION_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
          status: 'active_restriction',
          review_date: reviewDate,
          set_by_id: SET_BY_ID,
        },
      ]);
      // Existing pending task found
      mockTx.behaviourTask.findFirst.mockResolvedValue({
        id: 'existing-task-id',
        status: 'pending',
      });

      const result = await service.createReviewReminders(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        today,
      );

      expect(result).toBe(0);
      expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
    });

    it('should escalate task priority to high within 3 days of review_date', async () => {
      const today = '2026-03-26';
      const reviewDate = new Date('2026-03-28'); // 2 days away

      mockTx.behaviourGuardianRestriction.findMany.mockResolvedValue([
        {
          id: RESTRICTION_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
          status: 'active_restriction',
          review_date: reviewDate,
          set_by_id: SET_BY_ID,
        },
      ]);
      mockTx.behaviourTask.findFirst.mockResolvedValue(null);
      mockTx.behaviourTask.create.mockResolvedValue({ id: 'new-task-id' });

      const result = await service.createReviewReminders(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        today,
      );

      expect(result).toBe(1);
      expect(mockTx.behaviourTask.create).toHaveBeenCalledTimes(1);

      const createArgs = mockTx.behaviourTask.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createArgs[0].data).toMatchObject({
        priority: 'high',
        entity_id: RESTRICTION_ID,
        due_date: reviewDate,
      });
    });
  });

  // ─── expireEndedRestrictions ─────────────────────────────────────────────

  describe('expireEndedRestrictions', () => {
    it('should update active restrictions past their effective_until to expired', async () => {
      const restriction = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        status: 'active_restriction',
        effective_until: new Date('2026-03-20'),
      };
      mockTx.behaviourGuardianRestriction.findMany.mockResolvedValue([restriction]);
      mockTx.behaviourGuardianRestriction.update.mockResolvedValue({});

      const result = await service.expireEndedRestrictions(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        '2026-03-25',
      );

      expect(result).toBe(1);
      expect(mockTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: { status: 'expired' },
      });
      expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
        mockTx,
        TENANT_ID,
        'guardian_restriction',
        RESTRICTION_ID,
        '00000000-0000-0000-0000-000000000000',
        'expired',
        { status: 'active_restriction' },
        { status: 'expired' },
      );
    });

    it('should return 0 when no restrictions are expired', async () => {
      mockTx.behaviourGuardianRestriction.findMany.mockResolvedValue([]);

      const result = await service.expireEndedRestrictions(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        '2026-03-25',
      );

      expect(result).toBe(0);
    });
  });

  // ─── mapStatusToPrisma ────────────────────────────────────────────────────

  describe('list — mapStatusToPrisma', () => {
    it('should map "active" status to "active_restriction"', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);
      mockPrisma.behaviourGuardianRestriction.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'active',
      });

      expect(mockPrisma.behaviourGuardianRestriction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active_restriction',
          }),
        }),
      );
    });

    it('should map "superseded" status to "superseded_restriction"', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);
      mockPrisma.behaviourGuardianRestriction.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'superseded',
      });

      expect(mockPrisma.behaviourGuardianRestriction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'superseded_restriction',
          }),
        }),
      );
    });

    it('should pass unmapped status directly', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);
      mockPrisma.behaviourGuardianRestriction.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'revoked',
      });

      expect(mockPrisma.behaviourGuardianRestriction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'revoked',
          }),
        }),
      );
    });
  });

  // ─── list — filter branches ─────────────────────────────────────────────

  describe('list — filters', () => {
    it('should filter by student_id and parent_id', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);
      mockPrisma.behaviourGuardianRestriction.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
      });

      expect(mockPrisma.behaviourGuardianRestriction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            parent_id: PARENT_ID,
          }),
        }),
      );
    });

    it('should return paginated results', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);
      mockPrisma.behaviourGuardianRestriction.count.mockResolvedValue(50);

      const result = await service.list(TENANT_ID, {
        page: 2,
        pageSize: 10,
      });

      expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 50 });
    });
  });

  // ─── getDetail ────────────────────────────────────────────────────────────

  describe('getDetail', () => {
    it('should throw NotFoundException when restriction not found', async () => {
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      await expect(service.getDetail(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should return restriction with history', async () => {
      const restriction = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        status: 'active_restriction',
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(restriction);
      mockHistoryService.getHistory.mockResolvedValue({ data: [{ action: 'created' }] });

      const result = await service.getDetail(TENANT_ID, RESTRICTION_ID);

      expect(result.history).toHaveLength(1);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should throw NotFoundException when restriction not found', async () => {
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'missing-id', SET_BY_ID, { legal_basis: 'Court order' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return existing when no values change (empty dto)', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: null,
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);

      const result = await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {});

      expect(result).toEqual(existing);
      expect(mockRlsTx.behaviourGuardianRestriction.update).not.toHaveBeenCalled();
    });

    it('should update legal_basis field', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: null,
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        legal_basis: 'Court order',
      });

      const result = await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        legal_basis: 'Court order',
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({ legal_basis: 'Court order' }),
      });
      expect(result.legal_basis).toBe('Court order');
    });

    it('should update effective_until field', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: null,
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        effective_until: new Date('2026-12-31'),
      });

      await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        effective_until: '2026-12-31',
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({ effective_until: new Date('2026-12-31') }),
      });
    });

    it('should clear effective_until to null', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: new Date('2026-06-30'),
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        effective_until: null,
      });

      await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        effective_until: null,
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({ effective_until: null }),
      });
    });

    it('should update review_date field', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: null,
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        review_date: new Date('2026-06-01'),
      });

      await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        review_date: '2026-06-01',
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({ review_date: new Date('2026-06-01') }),
      });
    });

    it('should clear review_date to null', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: null,
        effective_until: null,
        review_date: new Date('2026-06-01'),
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        review_date: null,
      });

      await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        review_date: null,
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({ review_date: null }),
      });
    });

    it('should clear legal_basis to null/undefined', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        legal_basis: 'Court order',
        effective_until: null,
        review_date: null,
      };
      mockPrisma.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        legal_basis: null,
      });

      await service.update(TENANT_ID, RESTRICTION_ID, SET_BY_ID, {
        legal_basis: null,
      });

      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalled();
      expect(mockHistoryService.recordHistory).toHaveBeenCalled();
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      restriction_type: 'no_contact',
      reason: 'Legal requirement',
      effective_from: '2026-03-01',
    };

    it('should create restriction with basic fields', async () => {
      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        ...baseDto,
        status: 'active_restriction',
      });

      const result = await service.create(TENANT_ID, SET_BY_ID, baseDto);

      expect(result.id).toBe(RESTRICTION_ID);
      expect(mockRlsTx.behaviourGuardianRestriction.create).toHaveBeenCalled();
      expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'guardian_restriction',
        RESTRICTION_ID,
        SET_BY_ID,
        'created',
        null,
        expect.objectContaining({ status: 'active_restriction' }),
      );
    });

    it('should create restriction with optional fields', async () => {
      const dtoWithOptionals = {
        ...baseDto,
        legal_basis: 'Court order 2024/1234',
        effective_until: '2026-12-31',
        review_date: '2026-06-01',
      };

      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        ...dtoWithOptionals,
        status: 'active_restriction',
      });

      await service.create(TENANT_ID, SET_BY_ID, dtoWithOptionals);

      expect(mockRlsTx.behaviourGuardianRestriction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          legal_basis: 'Court order 2024/1234',
          effective_until: new Date('2026-12-31'),
          review_date: new Date('2026-06-01'),
        }),
      });
    });

    it('should create review task when review_date is within 14 days', async () => {
      const today = new Date();
      const inFiveDays = new Date(today);
      inFiveDays.setDate(inFiveDays.getDate() + 5);
      const dtoWithSoonReview = {
        ...baseDto,
        review_date: inFiveDays.toISOString().split('T')[0]!,
      };

      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        status: 'active_restriction',
      });
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });

      await service.create(TENANT_ID, SET_BY_ID, dtoWithSoonReview);

      expect(mockRlsTx.behaviourTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          task_type: 'guardian_restriction_review',
          entity_type: 'guardian_restriction',
          entity_id: RESTRICTION_ID,
          priority: 'medium',
        }),
      });
    });

    it('should create review task with high priority when review_date is within 3 days', async () => {
      const today = new Date();
      const inTwoDays = new Date(today);
      inTwoDays.setDate(inTwoDays.getDate() + 2);
      const dtoWithUrgentReview = {
        ...baseDto,
        review_date: inTwoDays.toISOString().split('T')[0]!,
      };

      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        status: 'active_restriction',
      });
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });

      await service.create(TENANT_ID, SET_BY_ID, dtoWithUrgentReview);

      expect(mockRlsTx.behaviourTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'high',
        }),
      });
    });

    it('should not create review task when review_date is more than 14 days away', async () => {
      const today = new Date();
      const inTwentyDays = new Date(today);
      inTwentyDays.setDate(inTwentyDays.getDate() + 20);
      const dtoWithFarReview = {
        ...baseDto,
        review_date: inTwentyDays.toISOString().split('T')[0]!,
      };

      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        status: 'active_restriction',
      });

      await service.create(TENANT_ID, SET_BY_ID, dtoWithFarReview);

      expect(mockRlsTx.behaviourTask.create).not.toHaveBeenCalled();
    });

    it('should not create review task when no review_date provided', async () => {
      mockRlsTx.behaviourGuardianRestriction.create.mockResolvedValue({
        id: RESTRICTION_ID,
        status: 'active_restriction',
      });

      await service.create(TENANT_ID, SET_BY_ID, baseDto);

      expect(mockRlsTx.behaviourTask.create).not.toHaveBeenCalled();
    });
  });

  // ─── revoke ──────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('should throw NotFoundException when restriction not found', async () => {
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      await expect(
        service.revoke(TENANT_ID, 'missing-id', SET_BY_ID, 'No longer needed'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should revoke an active restriction', async () => {
      const existing = {
        id: RESTRICTION_ID,
        tenant_id: TENANT_ID,
        status: 'active_restriction',
      };
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourGuardianRestriction.update.mockResolvedValue({
        ...existing,
        status: 'revoked',
        revoked_at: new Date(),
        revoked_by_id: SET_BY_ID,
        revoke_reason: 'No longer needed',
      });

      const result = await service.revoke(TENANT_ID, RESTRICTION_ID, SET_BY_ID, 'No longer needed');

      expect(result.status).toBe('revoked');
      expect(mockRlsTx.behaviourGuardianRestriction.update).toHaveBeenCalledWith({
        where: { id: RESTRICTION_ID },
        data: expect.objectContaining({
          status: 'revoked',
          revoked_by_id: SET_BY_ID,
          revoke_reason: 'No longer needed',
        }),
      });
      expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'guardian_restriction',
        RESTRICTION_ID,
        SET_BY_ID,
        'revoked',
        { status: 'active_restriction' },
        { status: 'revoked', revoke_reason: 'No longer needed' },
        'No longer needed',
      );
    });
  });

  // ─── listActive ──────────────────────────────────────────────────────────

  describe('listActive', () => {
    it('should return active restrictions within effective date range', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([
        {
          id: RESTRICTION_ID,
          status: 'active_restriction',
          student: { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
          parent: { id: PARENT_ID, first_name: 'Jane', last_name: 'Smith' },
        },
      ]);

      const result = await service.listActive(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(mockPrisma.behaviourGuardianRestriction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'active_restriction',
          }),
        }),
      );
    });

    it('should return empty array when no active restrictions', async () => {
      mockPrisma.behaviourGuardianRestriction.findMany.mockResolvedValue([]);

      const result = await service.listActive(TENANT_ID);

      expect(result).toEqual([]);
    });
  });
});
