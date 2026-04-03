import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../sequence/sequence.service';

import { CriticalIncidentResponseService } from './critical-incident-response.service';
import { CriticalIncidentService } from './critical-incident.service';
import type {
  AddExternalSupportDto,
  AddResponsePlanItemDto,
  DeclareIncidentDto,
  ResponsePlan,
  TransitionStatusDto,
  UpdateIncidentDto,
  UpdateResponsePlanItemDto,
} from './critical-incident.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INCIDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  criticalIncident: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  criticalIncidentAffected: {
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  incident_type: 'bereavement',
  description: 'A significant bereavement affecting the school community',
  occurred_at: new Date('2026-03-15T00:00:00Z'),
  scope: 'whole_school',
  scope_ids: null,
  declared_by_user_id: USER_ID,
  status: 'ci_active',
  response_plan: null,
  external_support_log: null,
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeResponsePlan = (): ResponsePlan => ({
  immediate: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      label: 'Convene Critical Incident Management Team',
      description: null,
      assigned_to_id: null,
      assigned_to_name: null,
      is_done: false,
      completed_at: null,
      completed_by_id: null,
      completed_by_name: null,
      notes: null,
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      label: 'Gather and verify facts',
      description: null,
      assigned_to_id: null,
      assigned_to_name: null,
      is_done: false,
      completed_at: null,
      completed_by_id: null,
      completed_by_name: null,
      notes: null,
    },
  ],
  short_term: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      label: 'Daily CI Management Team briefing',
      description: null,
      assigned_to_id: null,
      assigned_to_name: null,
      is_done: false,
      completed_at: null,
      completed_by_id: null,
      completed_by_name: null,
      notes: null,
    },
  ],
  medium_term: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      label: 'Review ongoing support needs',
      description: null,
      assigned_to_id: null,
      assigned_to_name: null,
      is_done: true,
      completed_at: '2026-03-16T10:00:00Z',
      completed_by_id: USER_ID,
      completed_by_name: null,
      notes: null,
    },
  ],
  long_term: [],
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CriticalIncidentService', () => {
  let service: CriticalIncidentService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockSequenceService: { nextNumber: jest.Mock };
  let mockResponseService: {
    updateResponsePlanItem: jest.Mock;
    addResponsePlanItem: jest.Mock;
    getResponsePlanProgress: jest.Mock;
    addExternalSupport: jest.Mock;
    updateExternalSupport: jest.Mock;
    listExternalSupport: jest.Mock;
  };
  let mockPastoralQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockSequenceService = {
      nextNumber: jest.fn().mockResolvedValue('CI-202603-000001'),
    };

    mockResponseService = {
      updateResponsePlanItem: jest.fn(),
      addResponsePlanItem: jest.fn(),
      getResponsePlanProgress: jest.fn(),
      addExternalSupport: jest.fn(),
      updateExternalSupport: jest.fn(),
      listExternalSupport: jest.fn(),
    };

    mockPastoralQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticalIncidentService,
        { provide: PrismaService, useValue: {} },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: CriticalIncidentResponseService, useValue: mockResponseService },
        { provide: getQueueToken('pastoral'), useValue: mockPastoralQueue },
      ],
    }).compile();

    service = module.get<CriticalIncidentService>(CriticalIncidentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── DECLARE ──────────────────────────────────────────────────────────────

  describe('declare', () => {
    const baseDto: DeclareIncidentDto = {
      incident_type: 'bereavement',
      description: 'A significant bereavement affecting the school community',
      incident_date: '2026-03-15',
      scope: 'whole_school',
    };

    it('should create incident with correct sequence number', async () => {
      const created = makeIncident();
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      const result = await service.declare(TENANT_ID, USER_ID, baseDto);

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'critical_incident',
        expect.anything(),
        'CI',
      );
      expect(result.data).toBeDefined();
      expect(result.data.incident_number).toBe('CI-202603-000001');
    });

    it('should validate scope constraints: year_group requires scope_year_group_ids', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        scope: 'year_group',
      };

      await expect(service.declare(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should validate scope constraints: year_group with empty IDs fails', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        scope: 'year_group',
        scope_year_group_ids: [],
      };

      await expect(service.declare(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should validate scope constraints: class requires scope_class_ids', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        scope: 'class',
      };

      await expect(service.declare(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should accept year_group scope with valid IDs', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        scope: 'year_group',
        scope_year_group_ids: [YEAR_GROUP_ID],
      };

      const created = makeIncident({ scope: 'year_group' });
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      const result = await service.declare(TENANT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scope: 'year_group',
          scope_ids: [YEAR_GROUP_ID],
        }),
      });
    });

    it('should accept class scope with valid IDs', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        scope: 'class',
        scope_class_ids: [CLASS_ID],
      };

      const created = makeIncident({ scope: 'class_group' });
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      const result = await service.declare(TENANT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scope: 'class_group',
          scope_ids: [CLASS_ID],
        }),
      });
    });

    it('should initialise response plan from default template', async () => {
      const created = makeIncident();
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      await service.declare(TENANT_ID, USER_ID, baseDto);

      const createCall = mockRlsTx.criticalIncident.create.mock.calls[0][0] as {
        data: { response_plan: ResponsePlan };
      };
      const plan = createCall.data.response_plan;

      // Verify all four phases exist
      expect(plan.immediate).toBeDefined();
      expect(plan.short_term).toBeDefined();
      expect(plan.medium_term).toBeDefined();
      expect(plan.long_term).toBeDefined();

      // Verify template items are present
      expect(plan.immediate.length).toBe(10);
      expect(plan.short_term.length).toBe(7);
      expect(plan.medium_term.length).toBe(6);
      expect(plan.long_term.length).toBe(5);

      // Verify each item has generated UUID and defaults
      const firstItem = plan.immediate[0] as NonNullable<(typeof plan.immediate)[0]>;
      expect(firstItem.id).toBeDefined();
      expect(firstItem.label).toBe('Convene Critical Incident Management Team');
      expect(firstItem.is_done).toBe(false);
      expect(firstItem.completed_at).toBeNull();
      expect(firstItem.assigned_to_id).toBeNull();
    });

    it('should record critical_incident_declared audit event', async () => {
      const created = makeIncident();
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      await service.declare(TENANT_ID, USER_ID, baseDto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'critical_incident_declared',
          entity_type: 'critical_incident',
          actor_user_id: USER_ID,
        }),
      );

      // Verification of Notification Pathway
      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:notify-incident-team',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          action: 'declared',
        }),
        expect.any(Object),
      );
    });

    it('should require incident_type_other when incident_type is ci_other/other', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        incident_type: 'other',
      };

      await expect(service.declare(TENANT_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should accept incident_type other with incident_type_other', async () => {
      const dto: DeclareIncidentDto = {
        ...baseDto,
        incident_type: 'other',
        incident_type_other: 'Natural disaster',
      };

      const created = makeIncident({ incident_type: 'ci_other' });
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      const result = await service.declare(TENANT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          incident_type: 'ci_other',
        }),
      });
    });

    it('should set status to ci_active on declaration', async () => {
      const created = makeIncident();
      mockRlsTx.criticalIncident.create.mockResolvedValue(created);

      await service.declare(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.criticalIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'ci_active',
        }),
      });
    });
  });

  // ─── TRANSITION STATUS ──────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should transition from ci_active to ci_monitoring', async () => {
      const existing = makeIncident({ status: 'ci_active' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        status: 'ci_monitoring',
      });

      const dto: TransitionStatusDto = {
        new_status: 'monitoring',
        reason: 'Immediate phase complete',
      };

      const result = await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'ci_monitoring' },
      });
    });

    it('should require closure_notes when transitioning to closed', async () => {
      const dto: TransitionStatusDto = {
        new_status: 'closed',
        reason: 'All support in place',
      };

      await expect(service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should transition from ci_active to ci_closed with closure_notes', async () => {
      const existing = makeIncident({ status: 'ci_active' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        status: 'ci_closed',
      });

      const dto: TransitionStatusDto = {
        new_status: 'closed',
        reason: 'Resolved directly',
        closure_notes: 'All support provided and monitoring complete.',
      };

      const result = await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'ci_closed' },
      });
    });

    it('should transition from ci_monitoring to ci_closed with closure_notes', async () => {
      const existing = makeIncident({ status: 'ci_monitoring' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        status: 'ci_closed',
      });

      const dto: TransitionStatusDto = {
        new_status: 'closed',
        reason: 'Monitoring period complete',
        closure_notes: 'All students receiving ongoing external support.',
      };

      const result = await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
    });

    it('should allow re-opening: ci_closed to ci_monitoring', async () => {
      const existing = makeIncident({ status: 'ci_closed' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        status: 'ci_monitoring',
      });

      const dto: TransitionStatusDto = {
        new_status: 'monitoring',
        reason: 'Anniversary reaction detected in affected students',
      };

      const result = await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'ci_monitoring' },
      });
    });

    it('should reject invalid transition: ci_closed to ci_active', async () => {
      const existing = makeIncident({ status: 'ci_closed' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);

      const dto: TransitionStatusDto = {
        new_status: 'active',
        reason: 'Trying to re-activate',
      };

      await expect(service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should record audit event on status transition', async () => {
      const existing = makeIncident({ status: 'ci_active' });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        status: 'ci_monitoring',
      });

      const dto: TransitionStatusDto = {
        new_status: 'monitoring',
        reason: 'Immediate phase complete',
      };

      await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'critical_incident_status_changed',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            to_status: 'monitoring',
            reason: 'Immediate phase complete',
          }),
        }),
      );
    });

    it('should throw NotFoundException when incident does not exist', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      const dto: TransitionStatusDto = {
        new_status: 'monitoring',
        reason: 'Test',
      };

      await expect(service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update incident description and record event', async () => {
      const existing = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncident.update.mockResolvedValue({
        ...existing,
        description: 'Updated description text',
      });

      const dto: UpdateIncidentDto = {
        description: 'Updated description text',
      };

      const result = await service.update(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: expect.objectContaining({
          description: 'Updated description text',
        }),
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'critical_incident_updated',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            new_description: 'Updated description text',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, INCIDENT_ID, USER_ID, {
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── RESPONSE PLAN ITEM: UPDATE ──────────────────────────────────────────

  describe('updateResponsePlanItem', () => {
    it('should delegate to CriticalIncidentResponseService.updateResponsePlanItem', async () => {
      const plan = makeResponsePlan();
      mockResponseService.updateResponsePlanItem.mockResolvedValue(plan);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: '11111111-1111-1111-1111-111111111111',
        is_done: true,
      };

      const result = await service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toEqual(plan);
      expect(mockResponseService.updateResponsePlanItem).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID, USER_ID, dto,
      );
    });
  });

  // ─── RESPONSE PLAN ITEM: ADD ─────────────────────────────────────────────

  describe('addResponsePlanItem', () => {
    it('should delegate to CriticalIncidentResponseService.addResponsePlanItem', async () => {
      const plan = makeResponsePlan();
      mockResponseService.addResponsePlanItem.mockResolvedValue(plan);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Notify board of management',
        description: 'Contact board chair immediately',
      };

      const result = await service.addResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toEqual(plan);
      expect(mockResponseService.addResponsePlanItem).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID, USER_ID, dto,
      );
    });
  });

  // ─── RESPONSE PLAN PROGRESS ──────────────────────────────────────────────

  describe('getResponsePlanProgress', () => {
    it('should delegate to CriticalIncidentResponseService.getResponsePlanProgress', async () => {
      const progress = [
        { phase: 'immediate', total: 2, completed: 0, percentage: 0 },
        { phase: 'short_term', total: 1, completed: 0, percentage: 0 },
        { phase: 'medium_term', total: 1, completed: 1, percentage: 100 },
        { phase: 'long_term', total: 0, completed: 0, percentage: 0 },
      ];
      mockResponseService.getResponsePlanProgress.mockResolvedValue(progress);

      const result = await service.getResponsePlanProgress(TENANT_ID, INCIDENT_ID);

      expect(result.data).toEqual(progress);
      expect(mockResponseService.getResponsePlanProgress).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID,
      );
    });
  });

  // ─── EXTERNAL SUPPORT: ADD ────────────────────────────────────────────────

  describe('addExternalSupport', () => {
    it('should delegate to CriticalIncidentResponseService.addExternalSupport', async () => {
      const entry = {
        id: 'entry-1',
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS Regional Team',
        recorded_by_id: USER_ID,
        recorded_at: '2026-03-16T10:00:00Z',
      };
      mockResponseService.addExternalSupport.mockResolvedValue(entry);

      const dto: AddExternalSupportDto = {
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS Regional Team',
        contact_person: 'Dr Smith',
        visit_date: '2026-03-16',
      };

      const result = await service.addExternalSupport(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toEqual(entry);
      expect(mockResponseService.addExternalSupport).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID, USER_ID, dto,
      );
    });
  });

  // ─── EXTERNAL SUPPORT: UPDATE ─────────────────────────────────────────────

  describe('updateExternalSupport', () => {
    it('should delegate to CriticalIncidentResponseService.updateExternalSupport', async () => {
      const entryId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const updatedEntry = {
        id: entryId,
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS Regional Team',
        outcome_notes: 'Supported 5 students, follow-up scheduled',
      };
      mockResponseService.updateExternalSupport.mockResolvedValue(updatedEntry);

      const dto = { outcome_notes: 'Supported 5 students, follow-up scheduled' };

      const result = await service.updateExternalSupport(TENANT_ID, INCIDENT_ID, entryId, USER_ID, dto);

      expect(result.data).toEqual(updatedEntry);
      expect(mockResponseService.updateExternalSupport).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID, entryId, USER_ID, dto,
      );
    });
  });

  // ─── GET BY ID ────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return incident with parsed response plan and affected count', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({
        response_plan: plan,
        external_support_log: [],
      });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncidentAffected.count.mockResolvedValue(5);

      const result = await service.getById(TENANT_ID, INCIDENT_ID);

      expect(result.data).toBeDefined();
      expect(result.data.affected_count).toBe(5);
      expect(result.data.response_plan).toEqual(plan);
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, INCIDENT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── LIST ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated results', async () => {
      const incidents = [makeIncident()];
      mockRlsTx.criticalIncident.findMany.mockResolvedValue(incidents);
      mockRlsTx.criticalIncident.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, {}, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
      });
    });

    it('should apply status filter', async () => {
      mockRlsTx.criticalIncident.findMany.mockResolvedValue([]);
      mockRlsTx.criticalIncident.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { status: 'active' }, 1, 20);

      expect(mockRlsTx.criticalIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ci_active',
          }),
        }),
      );
    });
  });

  // ─── LIST EXTERNAL SUPPORT ────────────────────────────────────────────────

  describe('listExternalSupport', () => {
    it('should delegate to CriticalIncidentResponseService.listExternalSupport', async () => {
      const entries = [
        { id: 'bbb', visit_date: '2026-03-17', recorded_at: '2026-03-17T08:00:00Z' },
        { id: 'aaa', visit_date: '2026-03-16', recorded_at: '2026-03-16T08:00:00Z' },
      ];
      mockResponseService.listExternalSupport.mockResolvedValue(entries);

      const result = await service.listExternalSupport(TENANT_ID, INCIDENT_ID);

      expect(result.data).toEqual(entries);
      expect(mockResponseService.listExternalSupport).toHaveBeenCalledWith(
        mockRlsTx, TENANT_ID, INCIDENT_ID,
      );
    });
  });
});
