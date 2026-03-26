import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourService } from './behaviour.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const CATEGORY_ID = 'cat-1';
const STUDENT_ID = 'student-1';
const PARTICIPANT_ID = 'participant-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourIncidentParticipant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  behaviourCategory: {
    findFirst: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
  },
  student: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  academicYear: {
    findUnique: jest.fn(),
  },
  academicPeriod: {
    findUnique: jest.fn(),
  },
  subject: {
    findUnique: jest.fn(),
  },
  room: {
    findUnique: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  id: CATEGORY_ID,
  tenant_id: TENANT_ID,
  name: 'Disruption',
  polarity: 'negative',
  severity: 5,
  point_value: -3,
  requires_follow_up: false,
  requires_parent_notification: false,
  parent_visible: true,
  benchmark_category: 'verbal_warning',
  ...overrides,
});

const makeStudent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  first_name: 'John',
  last_name: 'Doe',
  tenant_id: TENANT_ID,
  year_group: { id: 'yg-1', name: 'Year 7' },
  class_enrolments: [
    { class_entity: { name: '7A' }, status: 'active' },
  ],
  ...overrides,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  status: 'active',
  polarity: 'negative',
  severity: 5,
  description: 'Student was disruptive',
  parent_description: null,
  parent_description_locked: false,
  follow_up_required: false,
  reported_by_id: USER_ID,
  context_notes: 'Some sensitive context',
  ...overrides,
});

describe('BehaviourService', () => {
  let service: BehaviourService;
  let mockPrisma: {
    behaviourIncident: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };
  let mockScope: { getUserScope: jest.Mock; buildScopeFilter: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockBehaviourQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourIncident: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('BH-202603-0001'),
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };
    mockScope = {
      getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
      buildScopeFilter: jest.fn().mockReturnValue({}),
    };
    mockNotificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockBehaviourQueue = { add: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: BehaviourScopeService, useValue: mockScope },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<BehaviourService>(BehaviourService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createIncident ───────────────────────────────────────────────────

  describe('createIncident', () => {
    const baseDto = {
      category_id: CATEGORY_ID,
      description: 'Student was disruptive in class',
      occurred_at: '2026-03-01T10:00:00Z',
      academic_year_id: 'ay-1',
      student_ids: [STUDENT_ID],
      auto_submit: true,
      context_type: 'class' as const,
    };

    const setupCreateMocks = (categoryOverrides: Record<string, unknown> = {}) => {
      mockRlsTx.behaviourCategory!.findFirst.mockResolvedValue(
        makeCategory(categoryOverrides),
      );
      mockRlsTx.student!.findMany.mockResolvedValue([makeStudent(STUDENT_ID)]);
      mockRlsTx.user!.findUnique.mockResolvedValue({
        first_name: 'Jane',
        last_name: 'Teacher',
      });
      mockRlsTx.academicYear!.findUnique.mockResolvedValue(null);
      mockRlsTx.academicPeriod!.findUnique.mockResolvedValue(null);
      mockRlsTx.subject!.findUnique.mockResolvedValue(null);
      mockRlsTx.room!.findUnique.mockResolvedValue(null);
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(makeIncident());
      mockRlsTx.behaviourIncidentParticipant!.create.mockResolvedValue({
        id: PARTICIPANT_ID,
      });
      mockRlsTx.behaviourIncident!.findUnique.mockResolvedValue({
        ...makeIncident(),
        category: makeCategory(categoryOverrides),
        participants: [{ id: PARTICIPANT_ID }],
      });
    };

    it('should create an incident with context snapshot from category', async () => {
      setupCreateMocks();

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourIncident!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          category_id: CATEGORY_ID,
          polarity: 'negative',
          severity: 5,
          reported_by_id: USER_ID,
          status: 'active',
          context_snapshot: expect.objectContaining({
            category_name: 'Disruption',
            category_polarity: 'negative',
            category_severity: 5,
            category_point_value: -3,
            reported_by_name: 'Jane Teacher',
          }),
        }),
      });
    });

    it('should create student participant with snapshot', async () => {
      setupCreateMocks();

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourIncidentParticipant!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          participant_type: 'student',
          student_id: STUDENT_ID,
          role: 'subject',
          points_awarded: -3,
          student_snapshot: expect.objectContaining({
            student_name: 'John Doe',
            year_group_name: 'Year 7',
            class_name: '7A',
          }),
        }),
      });
    });

    it('should return existing incident on idempotency key match', async () => {
      const existing = { id: 'existing-id', participants: [] };
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(existing);

      const result = await service.createIncident(TENANT_ID, USER_ID, {
        ...baseDto,
        idempotency_key: 'idem-key-1',
      });

      expect(result).toEqual(existing);
      expect(mockRlsTx.behaviourIncident!.create).not.toHaveBeenCalled();
    });

    it('should auto-create follow-up task when follow_up_required', async () => {
      setupCreateMocks({ requires_follow_up: true });
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ follow_up_required: true }),
      );

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourTask!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          task_type: 'follow_up',
          entity_type: 'incident',
          entity_id: INCIDENT_ID,
          assigned_to_id: USER_ID,
          status: 'pending',
          priority: 'medium',
        }),
      });
    });

    it('should NOT create follow-up task when follow_up not required', async () => {
      setupCreateMocks({ requires_follow_up: false });

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourTask!.create).not.toHaveBeenCalled();
    });

    it('should queue parent notification when category requires it', async () => {
      setupCreateMocks({ requires_parent_notification: true });
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ parent_notification_status: 'pending' }),
      );

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'behaviour:parent-notification',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          student_ids: [STUDENT_ID],
        }),
      );
    });

    it('should NOT queue parent notification when not required', async () => {
      setupCreateMocks({ requires_parent_notification: false });

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockNotificationsQueue.add).not.toHaveBeenCalledWith(
        'behaviour:parent-notification',
        expect.anything(),
      );
    });

    it('should queue policy evaluation for active incidents', async () => {
      setupCreateMocks();

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:evaluate-policy',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          trigger: 'incident_created',
        }),
      );
    });

    it('should NOT queue policy evaluation for draft incidents', async () => {
      setupCreateMocks();
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ status: 'draft' }),
      );

      await service.createIncident(TENANT_ID, USER_ID, {
        ...baseDto,
        auto_submit: false,
      });

      expect(mockBehaviourQueue.add).not.toHaveBeenCalledWith(
        'behaviour:evaluate-policy',
        expect.anything(),
      );
    });

    it('should set initial status to draft when auto_submit is false', async () => {
      setupCreateMocks();
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ status: 'draft' }),
      );

      await service.createIncident(TENANT_ID, USER_ID, {
        ...baseDto,
        auto_submit: false,
      });

      expect(mockRlsTx.behaviourIncident!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'draft',
        }),
      });
    });

    it('should throw CATEGORY_NOT_FOUND when category does not exist', async () => {
      mockRlsTx.behaviourCategory!.findFirst.mockResolvedValue(null);

      await expect(
        service.createIncident(TENANT_ID, USER_ID, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NO_VALID_STUDENTS when no students found', async () => {
      mockRlsTx.behaviourCategory!.findFirst.mockResolvedValue(makeCategory());
      mockRlsTx.student!.findMany.mockResolvedValue([]);

      await expect(
        service.createIncident(TENANT_ID, USER_ID, baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record creation history', async () => {
      setupCreateMocks();

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'created',
        null,
        expect.objectContaining({ status: 'active', category: 'Disruption' }),
      );
    });

    it('should queue awards check for positive incidents', async () => {
      setupCreateMocks({ polarity: 'positive', point_value: 5 });
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ polarity: 'positive', status: 'active' }),
      );

      await service.createIncident(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:check-awards',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          student_ids: [STUDENT_ID],
        }),
      );
    });

    it('should not fail if notification queue add fails', async () => {
      setupCreateMocks({ requires_parent_notification: true });
      mockRlsTx.behaviourIncident!.create.mockResolvedValue(
        makeIncident({ parent_notification_status: 'pending' }),
      );
      mockNotificationsQueue.add.mockRejectedValue(new Error('Queue down'));

      // Should not throw
      const result = await service.createIncident(TENANT_ID, USER_ID, baseDto);
      expect(result).toBeDefined();
    });
  });

  // ─── listIncidents ────────────────────────────────────────────────────

  describe('listIncidents', () => {
    const baseQuery = {
      page: 1,
      pageSize: 20,
      sort: 'occurred_at' as const,
      order: 'desc' as const,
    };

    it('should apply scope filter from scope service', async () => {
      mockScope.getUserScope.mockResolvedValue({ scope: 'own' });
      mockScope.buildScopeFilter.mockReturnValue({ reported_by_id: USER_ID });

      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.log'], baseQuery);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(
        TENANT_ID, USER_ID, ['behaviour.log'],
      );
      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            reported_by_id: USER_ID,
          }),
        }),
      );
    });

    it('should filter by positive tab', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        tab: 'positive',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ polarity: 'positive' }),
        }),
      );
    });

    it('should filter by negative tab', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        tab: 'negative',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ polarity: 'negative' }),
        }),
      );
    });

    it('should filter by pending tab with correct statuses', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        tab: 'pending',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [
                'draft', 'investigating', 'under_review',
                'awaiting_approval', 'awaiting_parent_meeting',
              ],
            },
          }),
        }),
      );
    });

    it('should filter by escalated tab', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        tab: 'escalated',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'escalated' }),
        }),
      );
    });

    it('should filter by "my" tab using reported_by_id', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        tab: 'my',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reported_by_id: USER_ID }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      await service.listIncidents(TENANT_ID, USER_ID, ['behaviour.view'], {
        ...baseQuery,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurred_at: {
              gte: new Date('2026-03-01'),
              lte: new Date('2026-03-31'),
            },
          }),
        }),
      );
    });

    it('should return pagination meta', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(50);

      const result = await service.listIncidents(
        TENANT_ID, USER_ID, ['behaviour.view'], baseQuery,
      );

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 50 });
    });

    it('should project converted_to_safeguarding as "closed" for non-safeguarding users', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        { id: 'inc-1', status: 'converted_to_safeguarding' },
        { id: 'inc-2', status: 'active' },
      ]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(2);

      const result = await service.listIncidents(
        TENANT_ID, USER_ID, ['behaviour.view'], baseQuery,
      );

      expect(result.data[0]!.status).toBe('closed');
      expect(result.data[1]!.status).toBe('active');
    });

    it('should NOT project safeguarding status for users with safeguarding.view', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        { id: 'inc-1', status: 'converted_to_safeguarding' },
      ]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      const result = await service.listIncidents(
        TENANT_ID, USER_ID, ['behaviour.view', 'safeguarding.view'], baseQuery,
      );

      expect(result.data[0]!.status).toBe('converted_to_safeguarding');
    });
  });

  // ─── getIncident ─────────────────────────────────────────────────────

  describe('getIncident', () => {
    it('should return incident with participants', async () => {
      const incident = {
        ...makeIncident(),
        status: 'active',
        participants: [{ id: PARTICIPANT_ID, student: { id: STUDENT_ID } }],
        category: makeCategory(),
        reported_by: { id: USER_ID, first_name: 'Jane', last_name: 'Teacher' },
      };
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getIncident(
        TENANT_ID, INCIDENT_ID, USER_ID, ['behaviour.view', 'behaviour.view_sensitive'],
      );

      expect(result.id).toBe(INCIDENT_ID);
      expect(result.participants).toHaveLength(1);
    });

    it('should strip context_notes without view_sensitive permission', async () => {
      const incident = {
        ...makeIncident({ context_notes: 'Sensitive info' }),
        participants: [],
        status: 'active',
      };
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getIncident(
        TENANT_ID, INCIDENT_ID, USER_ID, ['behaviour.view'],
      );

      expect(result.context_notes).toBeUndefined();
    });

    it('should include context_notes with view_sensitive permission', async () => {
      const incident = {
        ...makeIncident({ context_notes: 'Sensitive info' }),
        participants: [],
        status: 'active',
      };
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getIncident(
        TENANT_ID, INCIDENT_ID, USER_ID, ['behaviour.view', 'behaviour.view_sensitive'],
      );

      expect(result.context_notes).toBe('Sensitive info');
    });

    it('should project converted_to_safeguarding as "closed" for non-safeguarding users', async () => {
      const incident = {
        ...makeIncident({ status: 'converted_to_safeguarding' }),
        participants: [],
      };
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getIncident(
        TENANT_ID, INCIDENT_ID, USER_ID, ['behaviour.view'],
      );

      expect(result.status).toBe('closed');
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.getIncident(TENANT_ID, 'nonexistent', USER_ID, ['behaviour.view']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateIncident ──────────────────────────────────────────────────

  describe('updateIncident', () => {
    it('should update fields and record history', async () => {
      const incident = makeIncident({ description: 'Old desc' });
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(incident);
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({
        ...incident,
        description: 'New desc',
      });

      const result = await service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        description: 'New desc',
      });

      expect(result.description).toBe('New desc');
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'updated',
        { description: 'Old desc' },
        { description: 'New desc' },
      );
    });

    it('should return unchanged incident when no fields differ', async () => {
      const incident = makeIncident({ description: 'Same desc' });
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(incident);

      const result = await service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        description: 'Same desc',
      });

      expect(result).toEqual(incident);
      expect(mockRlsTx.behaviourIncident!.update).not.toHaveBeenCalled();
    });

    it('should block parent_description edit when locked', async () => {
      const incident = makeIncident({ parent_description_locked: true });
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(incident);

      await expect(
        service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          parent_description: 'New description',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(null);

      await expect(
        service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── transitionStatus ────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should allow draft -> active transition', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'draft' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue(
        makeIncident({ status: 'active' }),
      );

      const result = await service.transitionStatus(
        TENANT_ID, INCIDENT_ID, USER_ID, { status: 'active' },
      );

      expect(result.status).toBe('active');
    });

    it('should allow active -> investigating transition', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'active' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue(
        makeIncident({ status: 'investigating' }),
      );

      const result = await service.transitionStatus(
        TENANT_ID, INCIDENT_ID, USER_ID, { status: 'investigating' },
      );

      expect(result.status).toBe('investigating');
    });

    it('should allow investigating -> resolved transition', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'investigating' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue(
        makeIncident({ status: 'resolved' }),
      );

      const result = await service.transitionStatus(
        TENANT_ID, INCIDENT_ID, USER_ID, { status: 'resolved' },
      );

      expect(result.status).toBe('resolved');
    });

    it('should throw INVALID_TRANSITION for blocked transitions', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'draft' }),
      );

      await expect(
        service.transitionStatus(
          TENANT_ID, INCIDENT_ID, USER_ID, { status: 'resolved' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw INVALID_TRANSITION from terminal status', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await expect(
        service.transitionStatus(
          TENANT_ID, INCIDENT_ID, USER_ID, { status: 'active' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record status change history with reason', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'active' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
        status: 'withdrawn',
        reason: 'Reported in error',
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'status_changed',
        { status: 'active' },
        { status: 'withdrawn' },
        'Reported in error',
      );
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(
          TENANT_ID, INCIDENT_ID, USER_ID, { status: 'active' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── withdrawIncident ────────────────────────────────────────────────

  describe('withdrawIncident', () => {
    it('should transition to withdrawn with reason', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'active' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      const result = await service.withdrawIncident(
        TENANT_ID, INCIDENT_ID, USER_ID, { reason: 'Reported in error' },
      );

      expect(result.status).toBe('withdrawn');
      expect(mockRlsTx.behaviourIncident!.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'withdrawn' },
      });
    });

    it('should reject withdrawal from terminal status', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await expect(
        service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          reason: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addParticipant ──────────────────────────────────────────────────

  describe('addParticipant', () => {
    it('should create participant with student snapshot', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        ...makeIncident(),
        category: makeCategory(),
      });
      mockRlsTx.student!.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockRlsTx.behaviourIncidentParticipant!.create.mockResolvedValue({
        id: PARTICIPANT_ID,
        participant_type: 'student',
        student_id: STUDENT_ID,
      });

      const result = await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        {
          participant_type: 'student',
          student_id: STUDENT_ID,
          role: 'subject',
          parent_visible: true,
        },
      );

      expect(result.id).toBe(PARTICIPANT_ID);
      expect(mockRlsTx.behaviourIncidentParticipant!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          participant_type: 'student',
          student_id: STUDENT_ID,
          student_snapshot: expect.objectContaining({
            student_name: 'John Doe',
            year_group_name: 'Year 7',
          }),
        }),
      });
    });

    it('should throw STUDENT_NOT_FOUND for missing student', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        ...makeIncident(),
        category: makeCategory(),
      });
      mockRlsTx.student!.findFirst.mockResolvedValue(null);

      await expect(
        service.addParticipant(TENANT_ID, INCIDENT_ID, USER_ID, {
          participant_type: 'student',
          student_id: 'nonexistent',
          role: 'subject',
          parent_visible: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw INCIDENT_NOT_FOUND for missing incident', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(null);

      await expect(
        service.addParticipant(TENANT_ID, 'nonexistent', USER_ID, {
          participant_type: 'student',
          student_id: STUDENT_ID,
          role: 'subject',
          parent_visible: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record participant_added history', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        ...makeIncident(),
        category: makeCategory(),
      });
      mockRlsTx.student!.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockRlsTx.behaviourIncidentParticipant!.create.mockResolvedValue({
        id: PARTICIPANT_ID,
      });

      await service.addParticipant(TENANT_ID, INCIDENT_ID, USER_ID, {
        participant_type: 'student',
        student_id: STUDENT_ID,
        role: 'subject',
        parent_visible: true,
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'participant_added',
        null,
        expect.objectContaining({
          participant_id: PARTICIPANT_ID,
          participant_type: 'student',
          student_id: STUDENT_ID,
        }),
      );
    });

    it('should queue policy evaluation for student participants', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        ...makeIncident(),
        category: makeCategory(),
      });
      mockRlsTx.student!.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockRlsTx.behaviourIncidentParticipant!.create.mockResolvedValue({
        id: PARTICIPANT_ID,
      });

      await service.addParticipant(TENANT_ID, INCIDENT_ID, USER_ID, {
        participant_type: 'student',
        student_id: STUDENT_ID,
        role: 'subject',
        parent_visible: true,
      });

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:evaluate-policy',
        expect.objectContaining({
          trigger: 'participant_added',
        }),
      );
    });
  });

  // ─── removeParticipant ───────────────────────────────────────────────

  describe('removeParticipant', () => {
    it('should remove participant successfully', async () => {
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        participant_type: 'student',
        student_id: STUDENT_ID,
      });
      mockRlsTx.behaviourIncidentParticipant!.count.mockResolvedValue(2);
      mockRlsTx.behaviourIncidentParticipant!.delete.mockResolvedValue({});

      const result = await service.removeParticipant(
        TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockRlsTx.behaviourIncidentParticipant!.delete).toHaveBeenCalledWith({
        where: { id: PARTICIPANT_ID },
      });
    });

    it('should throw LAST_STUDENT_PARTICIPANT when trying to remove last student', async () => {
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        participant_type: 'student',
        student_id: STUDENT_ID,
      });
      mockRlsTx.behaviourIncidentParticipant!.count.mockResolvedValue(1);

      await expect(
        service.removeParticipant(TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw PARTICIPANT_NOT_FOUND for missing participant', async () => {
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue(null);

      await expect(
        service.removeParticipant(TENANT_ID, INCIDENT_ID, 'nonexistent', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow removing non-student participant even if only one exists', async () => {
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        participant_type: 'staff',
        student_id: null,
      });
      mockRlsTx.behaviourIncidentParticipant!.delete.mockResolvedValue({});

      const result = await service.removeParticipant(
        TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID,
      );

      expect(result).toEqual({ success: true });
      // Should not check student count for non-student participants
      expect(mockRlsTx.behaviourIncidentParticipant!.count).not.toHaveBeenCalled();
    });

    it('should record participant_removed history', async () => {
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue({
        id: PARTICIPANT_ID,
        participant_type: 'student',
        student_id: STUDENT_ID,
      });
      mockRlsTx.behaviourIncidentParticipant!.count.mockResolvedValue(2);
      mockRlsTx.behaviourIncidentParticipant!.delete.mockResolvedValue({});

      await service.removeParticipant(
        TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID,
      );

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'participant_removed',
        {
          participant_id: PARTICIPANT_ID,
          participant_type: 'student',
          student_id: STUDENT_ID,
        },
        {},
      );
    });
  });
});
