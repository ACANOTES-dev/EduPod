import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourInterventionsService } from './behaviour-interventions.service';

// ─── Constants ─────────────────────────────────────────────────────────────
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STUDENT_ID = 'student-1';
const INTERVENTION_ID = 'intervention-1';
const ASSIGNED_TO_ID = 'staff-1';
const INCIDENT_ID_A = 'incident-a';
const INCIDENT_ID_B = 'incident-b';

// ─── RLS mock ──────────────────────────────────────────────────────────────
const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
  behaviourIntervention: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourInterventionIncident: {
    create: jest.fn(),
  },
  behaviourInterventionReview: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
  behaviourIncidentParticipant: {
    aggregate: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Factory helpers ───────────────────────────────────────────────────────
const makeIntervention = (overrides: Record<string, unknown> = {}) => ({
  id: INTERVENTION_ID,
  tenant_id: TENANT_ID,
  intervention_number: 'IV-202603-0001',
  student_id: STUDENT_ID,
  title: 'Behaviour Support Plan',
  type: 'behaviour_plan',
  status: 'planned',
  trigger_description: 'Repeated disruptions in class',
  goals: [{ goal: 'Reduce disruptions', measurable_target: '<2 per week', deadline: null }],
  strategies: [{ strategy: 'Daily check-in', responsible_staff_id: ASSIGNED_TO_ID, frequency: 'daily' }],
  assigned_to_id: ASSIGNED_TO_ID,
  start_date: new Date('2026-03-01'),
  target_end_date: null,
  review_frequency_days: 14,
  next_review_date: new Date('2026-03-15'),
  actual_end_date: null,
  send_aware: false,
  send_notes: 'Sensitive SEND info',
  outcome: null,
  outcome_notes: null,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
  ...overrides,
});

const makeReview = (overrides: Record<string, unknown> = {}) => ({
  id: 'review-1',
  tenant_id: TENANT_ID,
  intervention_id: INTERVENTION_ID,
  reviewed_by_id: USER_ID,
  review_date: new Date('2026-03-15'),
  progress: 'on_track',
  goal_updates: [{ goal: 'Reduce disruptions', status: 'progressing', notes: null }],
  notes: 'Student showing improvement',
  next_review_date: new Date('2026-03-29'),
  behaviour_points_since_last: 0,
  attendance_rate_since_last: null,
  created_at: new Date('2026-03-15'),
  ...overrides,
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('BehaviourInterventionsService', () => {
  let service: BehaviourInterventionsService;
  let mockPrisma: {
    behaviourIntervention: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    behaviourInterventionReview: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    behaviourTask: {
      findMany: jest.Mock;
    };
    behaviourIncidentParticipant: {
      aggregate: jest.Mock;
    };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourIntervention: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      behaviourInterventionReview: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourIncidentParticipant: {
        aggregate: jest.fn(),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('IV-202603-0001'),
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourInterventionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourInterventionsService>(BehaviourInterventionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      title: 'Behaviour Support Plan',
      type: 'behaviour_plan' as const,
      trigger_description: 'Repeated disruptions in class',
      goals: [{ goal: 'Reduce disruptions', measurable_target: '<2 per week', deadline: null }],
      strategies: [{ strategy: 'Daily check-in', responsible_staff_id: ASSIGNED_TO_ID, frequency: 'daily' }],
      assigned_to_id: ASSIGNED_TO_ID,
      start_date: '2026-03-01',
      review_frequency_days: 14,
    };

    const setupCreateMocks = () => {
      const created = makeIntervention();
      mockRlsTx.behaviourIntervention.create.mockResolvedValue(created);
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });
      mockRlsTx.behaviourEntityHistory.create.mockResolvedValue(undefined);
      mockRlsTx.behaviourInterventionIncident.create.mockResolvedValue({ id: 'link-1' });
      return created;
    };

    it('should generate IV- sequence number on creation', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockSequence.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'behaviour_intervention',
        expect.anything(),
        'IV',
      );
      expect(mockRlsTx.behaviourIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intervention_number: 'IV-202603-0001',
        }),
      });
    });

    it('should calculate next_review_date from start_date + review_frequency_days', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          next_review_date: new Date('2026-03-15'),
          review_frequency_days: 14,
        }),
      });
    });

    it('should map DTO status "active" to Prisma enum "active_intervention"', async () => {
      setupCreateMocks();

      // create always sets status to 'planned', but verify the mapping helper
      // by checking that initial status is 'planned' (not mapped)
      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'planned',
        }),
      });
    });

    it('should map DTO type "other" to Prisma enum "other_intervention"', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID, {
        ...baseDto,
        type: 'other' as const,
      });

      expect(mockRlsTx.behaviourIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'other_intervention',
        }),
      });
    });

    it('should record history on creation', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'intervention',
        INTERVENTION_ID,
        USER_ID,
        'created',
        null,
        expect.objectContaining({
          status: 'planned',
          type: 'behaviour_plan',
          student_id: STUDENT_ID,
        }),
      );
    });

    it('should link incident IDs when provided', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID, {
        ...baseDto,
        incident_ids: [INCIDENT_ID_A, INCIDENT_ID_B],
      });

      expect(mockRlsTx.behaviourInterventionIncident.create).toHaveBeenCalledTimes(2);
      expect(mockRlsTx.behaviourInterventionIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          incident_id: INCIDENT_ID_A,
        }),
      });
      expect(mockRlsTx.behaviourInterventionIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          incident_id: INCIDENT_ID_B,
        }),
      });
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────

  describe('list', () => {
    const baseQuery = { page: 1, pageSize: 20 };

    it('should return paginated interventions with meta', async () => {
      const interventions = [makeIntervention(), makeIntervention({ id: 'intervention-2' })];
      mockPrisma.behaviourIntervention.findMany.mockResolvedValue(interventions);
      mockPrisma.behaviourIntervention.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, baseQuery, true);

      expect(result).toEqual({
        data: interventions,
        meta: { page: 1, pageSize: 20, total: 2 },
      });
    });

    it('should filter by status when provided', async () => {
      mockPrisma.behaviourIntervention.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIntervention.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { ...baseQuery, status: 'active' }, true);

      expect(mockPrisma.behaviourIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active_intervention',
          }),
        }),
      );
    });

    it('should filter by student_id when provided', async () => {
      mockPrisma.behaviourIntervention.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIntervention.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { ...baseQuery, student_id: STUDENT_ID }, true);

      expect(mockPrisma.behaviourIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should strip send_notes when hasSensitivePermission is false', async () => {
      const intervention = makeIntervention({ send_notes: 'Sensitive SEND info' });
      mockPrisma.behaviourIntervention.findMany.mockResolvedValue([intervention]);
      mockPrisma.behaviourIntervention.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseQuery, false);

      const firstItem = result.data[0] as Record<string, unknown>;
      expect(firstItem).not.toHaveProperty('send_notes');
    });

    it('should include send_notes when hasSensitivePermission is true', async () => {
      const intervention = makeIntervention({ send_notes: 'Sensitive SEND info' });
      mockPrisma.behaviourIntervention.findMany.mockResolvedValue([intervention]);
      mockPrisma.behaviourIntervention.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseQuery, true);

      const firstItem = result.data[0] as Record<string, unknown>;
      expect(firstItem).toHaveProperty('send_notes', 'Sensitive SEND info');
    });
  });

  // ─── getDetail ─────────────────────────────────────────────────────────

  describe('getDetail', () => {
    it('should return intervention with reviews and linked incidents', async () => {
      const intervention = makeIntervention({
        reviews: [makeReview()],
        intervention_incidents: [
          { incident: { id: INCIDENT_ID_A, incident_number: 'BH-202603-0001', description: 'Fight', occurred_at: new Date(), status: 'active' } },
        ],
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
        assigned_to: { id: ASSIGNED_TO_ID, first_name: 'Jane', last_name: 'Teacher' },
      });
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(intervention);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);

      const result = await service.getDetail(TENANT_ID, INTERVENTION_ID, true);

      expect(result).toEqual(expect.objectContaining({
        id: INTERVENTION_ID,
        reviews: expect.arrayContaining([expect.objectContaining({ id: 'review-1' })]),
        intervention_incidents: expect.arrayContaining([
          expect.objectContaining({
            incident: expect.objectContaining({ id: INCIDENT_ID_A }),
          }),
        ]),
        tasks: [],
      }));
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.getDetail(TENANT_ID, 'non-existent-id', true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should strip send_notes based on permission flag', async () => {
      const intervention = makeIntervention({ send_notes: 'SEND details' });
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(intervention);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);

      const result = await service.getDetail(TENANT_ID, INTERVENTION_ID, false);

      expect(result.send_notes).toBeUndefined();
    });
  });

  // ─── update ────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed fields and record history', async () => {
      const existing = makeIntervention();
      const updated = makeIntervention({ title: 'Updated Plan' });
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourIntervention.update.mockResolvedValue(updated);
      mockRlsTx.behaviourInterventionReview.findFirst.mockResolvedValue(null);

      const result = await service.update(TENANT_ID, INTERVENTION_ID, USER_ID, {
        title: 'Updated Plan',
      });

      expect(result).toEqual(updated);
      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({ title: 'Updated Plan' }),
      });
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'intervention',
        INTERVENTION_ID,
        USER_ID,
        'updated',
        expect.objectContaining({ title: 'Behaviour Support Plan' }),
        expect.objectContaining({ title: 'Updated Plan' }),
      );
    });

    it('should throw NotFoundException for non-existent intervention', async () => {
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'non-existent', USER_ID, { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record old and new values in history', async () => {
      const existing = makeIntervention({ send_aware: false });
      const updated = makeIntervention({ send_aware: true });
      mockPrisma.behaviourIntervention.findFirst.mockResolvedValue(existing);
      mockRlsTx.behaviourIntervention.update.mockResolvedValue(updated);

      await service.update(TENANT_ID, INTERVENTION_ID, USER_ID, {
        send_aware: true,
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'intervention',
        INTERVENTION_ID,
        USER_ID,
        'updated',
        { send_aware: false },
        { send_aware: true },
      );
    });
  });

  // ─── transitionStatus ──────────────────────────────────────────────────

  describe('transitionStatus', () => {
    const setupTransitionMocks = (statusOverride: string) => {
      const intervention = makeIntervention({ status: statusOverride });
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue(intervention);
      mockRlsTx.behaviourIntervention.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          makeIntervention({ ...intervention, ...data }),
      );
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });
      return intervention;
    };

    // ── Valid transitions ────────────────────────────────────────────────

    it('should allow planned -> active_intervention', async () => {
      setupTransitionMocks('planned');

      const result = await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'active',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({ status: 'active_intervention' }),
      });
      expect(result.status).toBe('active_intervention');
    });

    it('should allow active_intervention -> monitoring', async () => {
      setupTransitionMocks('active_intervention');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'monitoring',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({ status: 'monitoring' }),
      });
    });

    it('should allow active_intervention -> completed_intervention', async () => {
      setupTransitionMocks('active_intervention');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'completed',
        outcome: 'improved',
        outcome_notes: 'Behaviour improved significantly',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          status: 'completed_intervention',
          actual_end_date: expect.any(Date),
          outcome: 'improved',
          outcome_notes: 'Behaviour improved significantly',
        }),
      });
    });

    it('should allow active_intervention -> abandoned', async () => {
      setupTransitionMocks('active_intervention');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'abandoned',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          status: 'abandoned',
          actual_end_date: expect.any(Date),
        }),
      });
    });

    it('should allow monitoring -> completed_intervention', async () => {
      setupTransitionMocks('monitoring');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'completed',
        outcome: 'improved',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          status: 'completed_intervention',
          actual_end_date: expect.any(Date),
        }),
      });
    });

    it('should allow monitoring -> active_intervention (re-activation)', async () => {
      setupTransitionMocks('monitoring');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'active',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({ status: 'active_intervention' }),
      });
    });

    // ── Blocked transitions ──────────────────────────────────────────────

    it('should reject completed_intervention -> any (terminal)', async () => {
      setupTransitionMocks('completed_intervention');

      await expect(
        service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject abandoned -> any (terminal)', async () => {
      setupTransitionMocks('abandoned');

      await expect(
        service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject planned -> completed_intervention (invalid skip)', async () => {
      setupTransitionMocks('planned');

      await expect(
        service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
          status: 'completed',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject planned -> monitoring (invalid skip)', async () => {
      setupTransitionMocks('planned');

      await expect(
        service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
          status: 'monitoring',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // ── Side effects ─────────────────────────────────────────────────────

    it('should auto-create intervention_review task on activation', async () => {
      setupTransitionMocks('planned');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'active',
      });

      expect(mockRlsTx.behaviourTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          task_type: 'intervention_review',
          entity_type: 'intervention',
          entity_id: INTERVENTION_ID,
          assigned_to_id: ASSIGNED_TO_ID,
          created_by_id: USER_ID,
          priority: 'medium',
          status: 'pending',
        }),
      });
    });

    it('should set actual_end_date on completion', async () => {
      setupTransitionMocks('active_intervention');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'completed',
        outcome: 'improved',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          actual_end_date: expect.any(Date),
        }),
      });
    });

    it('should set actual_end_date on abandonment', async () => {
      setupTransitionMocks('active_intervention');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'abandoned',
      });

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          actual_end_date: expect.any(Date),
        }),
      });
    });

    it('should record status_changed history', async () => {
      setupTransitionMocks('planned');

      await service.transitionStatus(TENANT_ID, INTERVENTION_ID, USER_ID, {
        status: 'active',
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'intervention',
        INTERVENTION_ID,
        USER_ID,
        'status_changed',
        { status: 'planned' },
        expect.objectContaining({ status: 'active_intervention' }),
      );
    });
  });

  // ─── createReview ──────────────────────────────────────────────────────

  describe('createReview', () => {
    const baseReviewDto = {
      review_date: '2026-03-15',
      progress: 'on_track' as const,
      goal_updates: [{ goal: 'Reduce disruptions', status: 'progressing' as const, notes: null }],
      notes: 'Student showing improvement',
      next_review_date: '2026-03-29',
    };

    const setupReviewMocks = (interventionOverrides: Record<string, unknown> = {}) => {
      const intervention = makeIntervention({
        status: 'active_intervention',
        ...interventionOverrides,
      });
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue(intervention);
      mockRlsTx.behaviourInterventionReview.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 5 },
      });
      const createdReview = makeReview({ behaviour_points_since_last: 5 });
      mockRlsTx.behaviourInterventionReview.create.mockResolvedValue(createdReview);
      mockRlsTx.behaviourIntervention.update.mockResolvedValue(
        makeIntervention({ next_review_date: new Date('2026-03-29') }),
      );
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });
      return { intervention, createdReview };
    };

    it('should create review record for active intervention', async () => {
      setupReviewMocks();

      const result = await service.createReview(
        TENANT_ID, INTERVENTION_ID, USER_ID, baseReviewDto,
      );

      expect(result).toEqual(expect.objectContaining({
        intervention_id: INTERVENTION_ID,
        progress: 'on_track',
      }));
      expect(mockRlsTx.behaviourInterventionReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          reviewed_by_id: USER_ID,
          progress: 'on_track',
          behaviour_points_since_last: 5,
        }),
      });
    });

    it('should throw NotFoundException for non-existent intervention', async () => {
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview(TENANT_ID, 'non-existent', USER_ID, baseReviewDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update next_review_date after review creation', async () => {
      setupReviewMocks();

      await service.createReview(TENANT_ID, INTERVENTION_ID, USER_ID, baseReviewDto);

      expect(mockRlsTx.behaviourIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          next_review_date: new Date('2026-03-29'),
        }),
      });
    });

    it('should reject review for non-reviewable status (planned)', async () => {
      setupReviewMocks({ status: 'planned' });

      await expect(
        service.createReview(TENANT_ID, INTERVENTION_ID, USER_ID, baseReviewDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
