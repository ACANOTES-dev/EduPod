import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../tenants/sequence.service';

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
  let mockPastoralQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockSequenceService = {
      nextNumber: jest.fn().mockResolvedValue('CI-202603-000001'),
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
    it('should mark item as done and set completed_at/completed_by', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: '11111111-1111-1111-1111-111111111111',
        is_done: true,
      };

      const result = await service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();

      // Verify the update call has the plan with the item marked done
      const updateCall = mockRlsTx.criticalIncident.update.mock.calls[0][0] as {
        data: { response_plan: ResponsePlan };
      };
      const updatedPlan = updateCall.data.response_plan;
      const updatedItem = updatedPlan.immediate[0] as NonNullable<
        (typeof updatedPlan.immediate)[0]
      >;

      expect(updatedItem.is_done).toBe(true);
      expect(updatedItem.completed_at).toBeDefined();
      expect(updatedItem.completed_by_id).toBe(USER_ID);
    });

    it('should record response_plan_item_updated audit event', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: '11111111-1111-1111-1111-111111111111',
        is_done: true,
      };

      await service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'response_plan_item_updated',
          payload: expect.objectContaining({
            phase: 'immediate',
            item_id: '11111111-1111-1111-1111-111111111111',
            is_done: true,
          }),
        }),
      );
    });

    it('should enqueue pastoral:notify-assigned-staff job when assigned_to_id is provided', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: '11111111-1111-1111-1111-111111111111',
        assigned_to_id: USER_ID,
      };

      await service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:notify-assigned-staff',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          item_id: dto.item_id,
          assigned_to_id: USER_ID,
        }),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when item not found in phase', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: 'non-existent-uuid',
        is_done: true,
      };

      await expect(
        service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should clear completed_at/by when marking item undone', async () => {
      const plan = makeResponsePlan();
      // Mark item as already done
      const firstItem = plan.immediate[0] as NonNullable<(typeof plan.immediate)[0]>;
      firstItem.is_done = true;
      firstItem.completed_at = '2026-03-16T10:00:00Z';
      firstItem.completed_by_id = USER_ID;

      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: '11111111-1111-1111-1111-111111111111',
        is_done: false,
      };

      await service.updateResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      const updateCall = mockRlsTx.criticalIncident.update.mock.calls[0][0] as {
        data: { response_plan: ResponsePlan };
      };
      const updatedItem = updateCall.data.response_plan.immediate[0] as NonNullable<
        (typeof updateCall.data.response_plan.immediate)[0]
      >;

      expect(updatedItem.is_done).toBe(false);
      expect(updatedItem.completed_at).toBeNull();
      expect(updatedItem.completed_by_id).toBeNull();
    });
  });

  // ─── RESPONSE PLAN ITEM: ADD ─────────────────────────────────────────────

  describe('addResponsePlanItem', () => {
    it('should add new item to correct phase with generated UUID', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Notify board of management',
        description: 'Contact board chair immediately',
      };

      const result = await service.addResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();

      const updateCall = mockRlsTx.criticalIncident.update.mock.calls[0][0] as {
        data: { response_plan: ResponsePlan };
      };
      const updatedPlan = updateCall.data.response_plan;

      // Original 2 items + 1 new
      expect(updatedPlan.immediate.length).toBe(3);

      const newItem = updatedPlan.immediate[2] as NonNullable<(typeof updatedPlan.immediate)[2]>;
      expect(newItem.label).toBe('Notify board of management');
      expect(newItem.description).toBe('Contact board chair immediately');
      expect(newItem.id).toBeDefined();
      expect(newItem.is_done).toBe(false);
    });

    it('should record response_plan_item_added audit event', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'short_term',
        label: 'Contact educational psychologist',
      };

      await service.addResponsePlanItem(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'response_plan_item_added',
          payload: expect.objectContaining({
            phase: 'short_term',
            label: 'Contact educational psychologist',
          }),
        }),
      );
    });
  });

  // ─── RESPONSE PLAN PROGRESS ──────────────────────────────────────────────

  describe('getResponsePlanProgress', () => {
    it('should return correct counts per phase', async () => {
      const plan = makeResponsePlan();
      const incident = makeIncident({ response_plan: plan });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getResponsePlanProgress(TENANT_ID, INCIDENT_ID);

      expect(result.data).toHaveLength(4);

      const immediate = result.data.find((p) => p.phase === 'immediate');
      expect(immediate).toEqual({
        phase: 'immediate',
        total: 2,
        completed: 0,
        percentage: 0,
      });

      const mediumTerm = result.data.find((p) => p.phase === 'medium_term');
      expect(mediumTerm).toEqual({
        phase: 'medium_term',
        total: 1,
        completed: 1,
        percentage: 100,
      });

      const longTerm = result.data.find((p) => p.phase === 'long_term');
      expect(longTerm).toEqual({
        phase: 'long_term',
        total: 0,
        completed: 0,
        percentage: 0,
      });
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(service.getResponsePlanProgress(TENANT_ID, INCIDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── EXTERNAL SUPPORT: ADD ────────────────────────────────────────────────

  describe('addExternalSupport', () => {
    it('should store entry in JSONB array with generated UUID', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS Regional Team',
        contact_person: 'Dr Smith',
        visit_date: '2026-03-16',
      };

      const result = await service.addExternalSupport(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(result.data.id).toBeDefined();
      expect(result.data.provider_type).toBe('neps_ci_team');
      expect(result.data.provider_name).toBe('NEPS Regional Team');
      expect(result.data.recorded_by_id).toBe(USER_ID);
      expect(result.data.recorded_at).toBeDefined();

      // Verify the JSONB was updated with one entry
      const updateCall = mockRlsTx.criticalIncident.update.mock.calls[0][0] as {
        data: { external_support_log: unknown[] };
      };
      expect(updateCall.data.external_support_log).toHaveLength(1);
    });

    it('should record external_support_added audit event', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'external_counsellor',
        provider_name: 'Counselling Services Ltd',
      };

      await service.addExternalSupport(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'external_support_added',
          payload: expect.objectContaining({
            provider_type: 'external_counsellor',
            provider_name: 'Counselling Services Ltd',
          }),
        }),
      );
    });
  });

  // ─── EXTERNAL SUPPORT: UPDATE ─────────────────────────────────────────────

  describe('updateExternalSupport', () => {
    it('should update entry in JSONB array', async () => {
      const entryId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const existingLog = [
        {
          id: entryId,
          provider_type: 'neps_ci_team',
          provider_name: 'NEPS Regional Team',
          contact_person: null,
          contact_details: null,
          visit_date: '2026-03-16',
          visit_time_start: null,
          visit_time_end: null,
          availability_notes: null,
          students_seen: [],
          outcome_notes: null,
          recorded_by_id: USER_ID,
          recorded_at: '2026-03-16T10:00:00Z',
        },
      ];

      const incident = makeIncident({ external_support_log: existingLog });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncident.update.mockResolvedValue(incident);

      const result = await service.updateExternalSupport(TENANT_ID, INCIDENT_ID, entryId, USER_ID, {
        outcome_notes: 'Supported 5 students, follow-up scheduled',
      });

      expect(result.data).toBeDefined();
      expect(result.data.outcome_notes).toBe('Supported 5 students, follow-up scheduled');
    });

    it('should throw NotFoundException for non-existent entry', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.updateExternalSupport(TENANT_ID, INCIDENT_ID, 'non-existent', USER_ID, {
          outcome_notes: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
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
    it('should return sorted entries', async () => {
      const log = [
        {
          id: 'aaa',
          provider_type: 'neps_ci_team',
          provider_name: 'NEPS',
          contact_person: null,
          contact_details: null,
          visit_date: '2026-03-16',
          visit_time_start: null,
          visit_time_end: null,
          availability_notes: null,
          students_seen: [],
          outcome_notes: null,
          recorded_by_id: USER_ID,
          recorded_at: '2026-03-16T08:00:00Z',
        },
        {
          id: 'bbb',
          provider_type: 'external_counsellor',
          provider_name: 'Counsellor',
          contact_person: null,
          contact_details: null,
          visit_date: '2026-03-17',
          visit_time_start: null,
          visit_time_end: null,
          availability_notes: null,
          students_seen: [],
          outcome_notes: null,
          recorded_by_id: USER_ID,
          recorded_at: '2026-03-17T08:00:00Z',
        },
      ];

      const incident = makeIncident({ external_support_log: log });
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.listExternalSupport(TENANT_ID, INCIDENT_ID);

      expect(result.data).toHaveLength(2);
      // Should be sorted by visit_date DESC
      const first = result.data[0] as NonNullable<(typeof result.data)[0]>;
      const second = result.data[1] as NonNullable<(typeof result.data)[1]>;
      expect(first.visit_date).toBe('2026-03-17');
      expect(second.visit_date).toBe('2026-03-16');
    });
  });
});
