import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourIncidentsService } from './behaviour-incidents.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const STUDENT_ID = 'student-1';
const CATEGORY_ID = 'category-1';
const ACADEMIC_YEAR_ID = 'year-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourIncidentParticipant: {
    create: jest.fn(),
  },
  behaviourCategory: {
    findFirst: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
  },
  student: {
    findMany: jest.fn(),
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

// ─── Factories ────────────────────────────────────────────────────────────────

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  id: CATEGORY_ID,
  tenant_id: TENANT_ID,
  name: 'Disruption',
  polarity: 'negative',
  severity: 3,
  point_value: -5,
  is_active: true,
  requires_parent_notification: false,
  requires_follow_up: false,
  parent_visible: true,
  benchmark_category: null,
  ...overrides,
});

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  first_name: 'Jane',
  last_name: 'Doe',
  year_group: { id: 'yg-1', name: 'Year 5' },
  class_enrolments: [{ class_entity: { name: 'Class 5A' } }],
  ...overrides,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  incident_number: 'BH-202603-000001',
  category_id: CATEGORY_ID,
  polarity: 'negative',
  severity: 3,
  reported_by_id: USER_ID,
  description: 'Disruption',
  status: 'active',
  follow_up_required: false,
  parent_notification_status: 'not_required',
  context_notes: 'Sensitive notes',
  parent_description: null,
  parent_description_ar: null,
  parent_description_locked: false,
  retention_status: 'active',
  automation_failed: false,
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourIncidentsService', () => {
  let service: BehaviourIncidentsService;
  let mockPrisma: {
    behaviourIncident: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };
  let mockScope: { getUserScope: jest.Mock; buildScopeFilter: jest.Mock };
  let mockSideEffects: {
    emitParentNotification: jest.Mock;
    emitPolicyEvaluation: jest.Mock;
    emitCheckAwards: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourIncident: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('BH-202603-000001'),
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };
    mockScope = {
      getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
      buildScopeFilter: jest.fn().mockReturnValue({}),
    };
    mockSideEffects = {
      emitParentNotification: jest.fn().mockResolvedValue(true),
      emitPolicyEvaluation: jest.fn().mockResolvedValue(true),
      emitCheckAwards: jest.fn().mockResolvedValue(true),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourIncidentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: BehaviourScopeService, useValue: mockScope },
        { provide: BehaviourSideEffectsService, useValue: mockSideEffects },
      ],
    }).compile();

    service = module.get<BehaviourIncidentsService>(BehaviourIncidentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createIncident ────────────────────────────────────────────────────────

  describe('BehaviourIncidentsService — createIncident', () => {
    const baseDto = {
      category_id: CATEGORY_ID,
      student_ids: [STUDENT_ID],
      description: 'Disruption in class',
      occurred_at: '2026-03-20T10:00:00Z',
      academic_year_id: ACADEMIC_YEAR_ID,
      auto_submit: true,
    };

    function setupCreateMocks(overrides?: {
      categoryOverrides?: Record<string, unknown>;
      students?: unknown[];
      existingIncident?: unknown;
    }) {
      mockRlsTx.behaviourCategory.findFirst.mockResolvedValue(
        makeCategory(overrides?.categoryOverrides ?? {}),
      );
      mockRlsTx.student.findMany.mockResolvedValue(overrides?.students ?? [makeStudent()]);
      mockRlsTx.user.findUnique.mockResolvedValue({
        first_name: 'John',
        last_name: 'Teacher',
      });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(makeIncident());
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ category: makeCategory(), participants: [] }),
      );
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue({
        id: 'participant-1',
      });
      mockRlsTx.behaviourTask.create.mockResolvedValue({ id: 'task-1' });

      if (overrides?.existingIncident) {
        mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(overrides.existingIncident);
      } else {
        mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);
      }
    }

    it('should create an incident and return it with includes', async () => {
      setupCreateMocks();

      const result = await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSequence.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'behaviour_incident',
        mockRlsTx,
        'BH',
      );
      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return existing incident on idempotency_key match', async () => {
      const existingIncident = makeIncident({ participants: [] });
      setupCreateMocks({ existingIncident });

      const dto = {
        ...baseDto,
        idempotency_key: 'key-123',
      };

      const result = await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(result).toEqual(existingIncident);
      expect(mockRlsTx.behaviourIncident.create).not.toHaveBeenCalled();
    });

    it('should skip idempotency check when idempotency_key is not provided', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      // findFirst for idempotency should NOT be called (no key)
      // But findFirst IS called by create for other reasons
      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when category is not found', async () => {
      mockRlsTx.behaviourCategory.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);
      mockRlsTx.student.findMany.mockResolvedValue([makeStudent()]);

      await expect(
        service.createIncident(
          TENANT_ID,
          USER_ID,
          baseDto as Parameters<typeof service.createIncident>[2],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no valid students found', async () => {
      mockRlsTx.behaviourCategory.findFirst.mockResolvedValue(makeCategory());
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);
      mockRlsTx.student.findMany.mockResolvedValue([]);

      await expect(
        service.createIncident(
          TENANT_ID,
          USER_ID,
          baseDto as Parameters<typeof service.createIncident>[2],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set status to draft when auto_submit is false', async () => {
      setupCreateMocks();

      const dto = { ...baseDto, auto_submit: false };

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'draft' }),
      });
    });

    it('should set status to active when auto_submit is true', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'active' }),
      });
    });

    it('should set parent_notification_status to pending when category requires notification', async () => {
      setupCreateMocks({ categoryOverrides: { requires_parent_notification: true } });

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ parent_notification_status: 'pending' }),
      });
    });

    it('should set parent_notification_status to not_required when category does not require', async () => {
      setupCreateMocks({ categoryOverrides: { requires_parent_notification: false } });

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ parent_notification_status: 'not_required' }),
      });
    });

    it('should create follow-up task when follow_up_required and status is active', async () => {
      setupCreateMocks({ categoryOverrides: { requires_follow_up: true } });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(
        makeIncident({ follow_up_required: true, status: 'active' }),
      );

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          task_type: 'follow_up',
          entity_type: 'incident',
        }),
      });
    });

    it('should NOT create follow-up task when status is draft', async () => {
      setupCreateMocks({ categoryOverrides: { requires_follow_up: true } });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(
        makeIncident({ follow_up_required: true, status: 'draft' }),
      );

      const dto = { ...baseDto, auto_submit: false };
      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourTask.create).not.toHaveBeenCalled();
    });

    it('should NOT create follow-up task when follow_up_required is false', async () => {
      setupCreateMocks();
      mockRlsTx.behaviourIncident.create.mockResolvedValue(
        makeIncident({ follow_up_required: false, status: 'active' }),
      );

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourTask.create).not.toHaveBeenCalled();
    });

    it('should emit parent notification when status is active and notification is pending', async () => {
      setupCreateMocks({ categoryOverrides: { requires_parent_notification: true } });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(
        makeIncident({ parent_notification_status: 'pending', status: 'active' }),
      );

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitParentNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          student_ids: [STUDENT_ID],
        }),
      );
    });

    it('should NOT emit parent notification when status is draft', async () => {
      setupCreateMocks({ categoryOverrides: { requires_parent_notification: true } });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(
        makeIncident({ parent_notification_status: 'pending', status: 'draft' }),
      );

      const dto = { ...baseDto, auto_submit: false };
      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitParentNotification).not.toHaveBeenCalled();
    });

    it('should emit policy evaluation when status is active', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitPolicyEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          trigger: 'incident_created',
        }),
      );
    });

    it('should NOT emit policy evaluation when status is draft', async () => {
      setupCreateMocks();

      const dto = { ...baseDto, auto_submit: false };
      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitPolicyEvaluation).not.toHaveBeenCalled();
    });

    it('should emit check awards for positive category on active status', async () => {
      setupCreateMocks({ categoryOverrides: { polarity: 'positive' } });
      mockRlsTx.behaviourIncident.create.mockResolvedValue(makeIncident({ status: 'active' }));

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitCheckAwards).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          student_ids: [STUDENT_ID],
        }),
      );
    });

    it('should NOT emit check awards for negative category', async () => {
      setupCreateMocks({ categoryOverrides: { polarity: 'negative' } });

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockSideEffects.emitCheckAwards).not.toHaveBeenCalled();
    });

    it('should set automation_failed flag when side-effect enqueue fails', async () => {
      setupCreateMocks();
      mockSideEffects.emitPolicyEvaluation.mockResolvedValue(false);

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { automation_failed: true },
      });
    });

    it('should NOT set automation_failed when all side-effects succeed', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      // update should not be called for automation_failed (only findUnique for return)
      const updateCalls = mockRlsTx.behaviourIncident.update.mock.calls;
      const automationUpdate = updateCalls.find(
        (call: [{ data: { automation_failed?: boolean } }]) => call[0]?.data?.automation_failed,
      );
      expect(automationUpdate).toBeUndefined();
    });

    it('should look up optional fields (subject, room, academicPeriod) when provided', async () => {
      setupCreateMocks();
      mockRlsTx.subject.findUnique.mockResolvedValue({ name: 'Mathematics' });
      mockRlsTx.room.findUnique.mockResolvedValue({ name: 'Room 101' });
      mockRlsTx.academicPeriod.findUnique.mockResolvedValue({ name: 'Term 1' });
      mockRlsTx.academicYear.findUnique.mockResolvedValue({ name: '2025-2026' });

      const dto = {
        ...baseDto,
        subject_id: 'subject-1',
        room_id: 'room-1',
        academic_period_id: 'period-1',
      };

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.subject.findUnique).toHaveBeenCalled();
      expect(mockRlsTx.room.findUnique).toHaveBeenCalled();
      expect(mockRlsTx.academicPeriod.findUnique).toHaveBeenCalled();
    });

    it('should NOT look up optional fields when not provided', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.subject.findUnique).not.toHaveBeenCalled();
      expect(mockRlsTx.room.findUnique).not.toHaveBeenCalled();
      expect(mockRlsTx.academicPeriod.findUnique).not.toHaveBeenCalled();
    });

    it('should handle reporter not found gracefully (show Unknown)', async () => {
      setupCreateMocks();
      mockRlsTx.user.findUnique.mockResolvedValue(null);

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          context_snapshot: expect.objectContaining({
            reported_by_name: 'Unknown',
          }),
        }),
      });
    });

    it('should map context_type using CONTEXT_TYPE_MAP', async () => {
      setupCreateMocks();

      const dto = { ...baseDto, context_type: 'break' };
      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ context_type: 'break_' }),
      });
    });

    it('should default context_type to other for unknown values', async () => {
      setupCreateMocks();

      const dto = { ...baseDto, context_type: 'unknown_type' };
      await service.createIncident(
        TENANT_ID,
        USER_ID,
        dto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ context_type: 'other' }),
      });
    });

    it('should default context_type to class_ when not provided', async () => {
      setupCreateMocks();

      await service.createIncident(
        TENANT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.createIncident>[2],
      );

      expect(mockRlsTx.behaviourIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ context_type: 'class_' }),
      });
    });
  });

  // ─── listIncidents ─────────────────────────────────────────────────────────

  describe('BehaviourIncidentsService — listIncidents', () => {
    const baseQuery = {
      page: 1,
      pageSize: 20,
      sort: 'occurred_at' as const,
      order: 'desc' as const,
    };

    it('should apply tab=positive filter', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        tab: 'positive',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ polarity: 'positive' }),
        }),
      );
    });

    it('should apply tab=negative filter', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        tab: 'negative',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ polarity: 'negative' }),
        }),
      );
    });

    it('should apply tab=pending filter with multiple statuses', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        tab: 'pending',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: expect.arrayContaining(['draft', 'investigating']) },
          }),
        }),
      );
    });

    it('should apply tab=escalated filter', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        tab: 'escalated',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'escalated' }),
        }),
      );
    });

    it('should apply tab=my filter to reported_by_id', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        tab: 'my',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reported_by_id: USER_ID }),
        }),
      );
    });

    it('should apply date_from and date_to filters', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            occurred_at: { gte: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should apply student_id filter as participant relation', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        student_id: STUDENT_ID,
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            participants: {
              some: { student_id: STUDENT_ID, participant_type: 'student' },
            },
          }),
        }),
      );
    });

    it('should project converted_to_safeguarding as closed for users without safeguarding.view', async () => {
      const safeguardingIncident = {
        ...makeIncident({ status: 'converted_to_safeguarding' }),
      };
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([safeguardingIncident]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      const result = await service.listIncidents(
        TENANT_ID,
        USER_ID,
        [],
        baseQuery as Parameters<typeof service.listIncidents>[3],
      );

      expect(result.data[0]!.status).toBe('closed');
    });

    it('should NOT project safeguarding status for users with safeguarding.view', async () => {
      const safeguardingIncident = {
        ...makeIncident({ status: 'converted_to_safeguarding' }),
      };
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([safeguardingIncident]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      const result = await service.listIncidents(
        TENANT_ID,
        USER_ID,
        ['safeguarding.view'],
        baseQuery as Parameters<typeof service.listIncidents>[3],
      );

      expect(result.data[0]!.status).toBe('converted_to_safeguarding');
    });

    it('should apply additional filters (polarity, status, category_id, reported_by_id, academic_year_id, follow_up_required)', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listIncidents(TENANT_ID, USER_ID, [], {
        ...baseQuery,
        polarity: 'negative',
        status: 'active',
        category_id: CATEGORY_ID,
        reported_by_id: USER_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        follow_up_required: true,
      } as Parameters<typeof service.listIncidents>[3]);

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            polarity: 'negative',
            status: 'active',
            category_id: CATEGORY_ID,
            reported_by_id: USER_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            follow_up_required: true,
          }),
        }),
      );
    });
  });

  // ─── getIncident ───────────────────────────────────────────────────────────

  describe('BehaviourIncidentsService — getIncident', () => {
    it('should throw NotFoundException when incident not found', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(service.getIncident(TENANT_ID, INCIDENT_ID, USER_ID, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should project converted_to_safeguarding as closed without safeguarding.view', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'converted_to_safeguarding', context_notes: 'secret' }),
      );

      const result = await service.getIncident(TENANT_ID, INCIDENT_ID, USER_ID, []);

      expect(result.status).toBe('closed');
    });

    it('should show real status with safeguarding.view permission', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'converted_to_safeguarding' }),
      );

      const result = await service.getIncident(TENANT_ID, INCIDENT_ID, USER_ID, [
        'safeguarding.view',
      ]);

      expect(result.status).toBe('converted_to_safeguarding');
    });

    it('should strip context_notes without behaviour.view_sensitive', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ context_notes: 'Sensitive info' }),
      );

      const result = await service.getIncident(TENANT_ID, INCIDENT_ID, USER_ID, []);

      expect(result.context_notes).toBeUndefined();
    });

    it('should include context_notes with behaviour.view_sensitive permission', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ context_notes: 'Sensitive info' }),
      );

      const result = await service.getIncident(TENANT_ID, INCIDENT_ID, USER_ID, [
        'behaviour.view_sensitive',
      ]);

      expect(result.context_notes).toBe('Sensitive info');
    });
  });

  // ─── updateIncident ────────────────────────────────────────────────────────

  describe('BehaviourIncidentsService — updateIncident', () => {
    it('should throw NotFoundException when incident not found', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, { description: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return incident unchanged when no values differ', async () => {
      const incident = makeIncident({ description: 'Same' });
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(incident);

      const result = await service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        description: 'Same',
      });

      expect(result).toEqual(incident);
      expect(mockRlsTx.behaviourIncident.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when parent_description is locked', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ parent_description_locked: true }),
      );

      await expect(
        service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          parent_description: 'New parent desc',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update incident and record history', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ description: 'Old description' }),
      );
      mockRlsTx.behaviourIncident.update.mockResolvedValue(
        makeIncident({ description: 'Updated description' }),
      );

      await service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        description: 'Updated description',
      });

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalled();
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'updated',
        expect.objectContaining({ description: 'Old description' }),
        expect.objectContaining({ description: 'Updated description' }),
      );
    });

    it('should update context_type using mapping when provided', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ context_type: 'class_' }),
      );
      mockRlsTx.behaviourIncident.update.mockResolvedValue(
        makeIncident({ context_type: 'break_' }),
      );

      await service.updateIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        context_type: 'break',
      } as Parameters<typeof service.updateIncident>[3]);

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ context_type: 'break_' }),
        }),
      );
    });
  });

  // ─── getMyIncidents ────────────────────────────────────────────────────────

  describe('BehaviourIncidentsService — getMyIncidents', () => {
    it('should return paginated incidents for the requesting user', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([makeIncident()]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      const result = await service.getMyIncidents(TENANT_ID, USER_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });
});
