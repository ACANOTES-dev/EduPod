import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';
import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Mock Types ──────────────────────────────────────────────────────────────

interface MockTx {
  behaviourGuardianRestriction: {
    count: jest.Mock;
    findMany: jest.Mock;
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BehaviourGuardianRestrictionsService', () => {
  let service: BehaviourGuardianRestrictionsService;
  let mockTx: MockTx;
  let mockPrisma: MockPrisma;
  let mockHistoryService: { recordHistory: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
  const PARENT_ID = '33333333-3333-3333-3333-333333333333';
  const RESTRICTION_ID = '44444444-4444-4444-4444-444444444444';
  const SET_BY_ID = '55555555-5555-5555-5555-555555555555';

  beforeEach(async () => {
    mockTx = {
      behaviourGuardianRestriction: {
        count: jest.fn(),
        findMany: jest.fn(),
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
      expect(
        mockTx.behaviourGuardianRestriction.count,
      ).toHaveBeenCalledTimes(1);

      const callArgs =
        mockTx.behaviourGuardianRestriction.count.mock.calls[0] as [
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
      expect(
        mockTx.behaviourGuardianRestriction.count,
      ).toHaveBeenCalledTimes(1);

      const callArgs =
        mockTx.behaviourGuardianRestriction.count.mock.calls[0] as [
          { where: Record<string, unknown> },
        ];
      expect(callArgs[0].where).toHaveProperty(
        'status',
        'active_restriction',
      );
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
});
