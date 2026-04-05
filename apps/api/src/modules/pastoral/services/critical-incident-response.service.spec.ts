/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('mocked-uuid-1111-1111-1111-111111111111'),
}));
/* eslint-enable import/order */

import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { QUEUE_NAMES } from '../../../../../worker/src/base/queue.constants';
import type { PrismaService } from '../../prisma/prisma.service';

import { CriticalIncidentResponseService } from './critical-incident-response.service';
import type {
  AddExternalSupportDto,
  AddResponsePlanItemDto,
  ExternalSupportEntry,
  ResponsePlan,
  ResponsePlanItem,
  UpdateResponsePlanItemDto,
} from './critical-incident.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INCIDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ITEM_ID_1 = '11111111-1111-1111-1111-111111111111';
const ITEM_ID_2 = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ASSIGNED_USER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeResponsePlanItem = (overrides: Partial<ResponsePlanItem> = {}): ResponsePlanItem => ({
  id: ITEM_ID_1,
  label: 'Convene management team',
  description: null,
  assigned_to_id: null,
  assigned_to_name: null,
  is_done: false,
  completed_at: null,
  completed_by_id: null,
  completed_by_name: null,
  notes: null,
  ...overrides,
});

const makeResponsePlan = (overrides: Partial<ResponsePlan> = {}): ResponsePlan => ({
  immediate: [
    makeResponsePlanItem(),
    makeResponsePlanItem({ id: ITEM_ID_2, label: 'Gather facts' }),
  ],
  short_term: [
    makeResponsePlanItem({ id: '33333333-3333-3333-3333-333333333333', label: 'Daily briefing' }),
  ],
  medium_term: [],
  long_term: [],
  ...overrides,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  incident_type: 'bereavement',
  description: 'A bereavement incident',
  status: 'ci_active',
  response_plan: makeResponsePlan(),
  external_support_log: null,
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeExternalSupportEntry = (
  overrides: Partial<ExternalSupportEntry> = {},
): ExternalSupportEntry => ({
  id: ENTRY_ID,
  provider_type: 'neps_ci_team',
  provider_name: 'NEPS Regional Team',
  contact_person: 'Dr Smith',
  contact_details: '01234567890',
  visit_date: '2026-03-16',
  visit_time_start: '09:00',
  visit_time_end: '12:00',
  availability_notes: null,
  students_seen: [],
  outcome_notes: null,
  recorded_by_id: USER_ID,
  recorded_at: '2026-03-16T10:00:00Z',
  ...overrides,
});

// ─── Mock DB ───────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  criticalIncident: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('CriticalIncidentResponseService', () => {
  let service: CriticalIncidentResponseService;
  let mockEventService: { write: jest.Mock };
  let mockPastoralQueue: { add: jest.Mock };
  let mockDb: ReturnType<typeof buildMockDb>;

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockPastoralQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticalIncidentResponseService,
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: getQueueToken(QUEUE_NAMES.PASTORAL), useValue: mockPastoralQueue },
      ],
    }).compile();

    service = module.get<CriticalIncidentResponseService>(CriticalIncidentResponseService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── updateResponsePlanItem ────────────────────────────────────────────────

  describe('CriticalIncidentResponseService — updateResponsePlanItem', () => {
    it('should update item and return plan', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        notes: 'Meeting scheduled for 3pm',
      };

      const result = await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.immediate[0]?.notes).toBe('Meeting scheduled for 3pm');
      expect(mockDb.criticalIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { response_plan: expect.objectContaining({ immediate: expect.any(Array) }) },
      });
    });

    it('should throw INVALID_PHASE for bad phase', async () => {
      const dto = {
        phase: 'invalid_phase' as UpdateResponsePlanItemDto['phase'],
        item_id: ITEM_ID_1,
      };

      await expect(
        service.updateResponsePlanItem(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw INCIDENT_NOT_FOUND when incident does not exist', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
      };

      await expect(
        service.updateResponsePlanItem(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw PLAN_ITEM_NOT_FOUND for missing item', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(makeIncident());

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: 'nonexistent-item-id',
      };

      await expect(
        service.updateResponsePlanItem(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should mark item done with completion metadata', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        is_done: true,
      };

      const result = await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      const updatedItem = result.immediate[0];
      expect(updatedItem?.is_done).toBe(true);
      expect(updatedItem?.completed_at).toBeDefined();
      expect(updatedItem?.completed_by_id).toBe(USER_ID);
    });

    it('should enqueue notification when assigned_to_id is set', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        assigned_to_id: ASSIGNED_USER_ID,
      };

      await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:notify-assigned-staff',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          item_id: ITEM_ID_1,
          assigned_to_id: ASSIGNED_USER_ID,
        }),
        expect.objectContaining({
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });

    it('should fire audit event on update', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        notes: 'Updated',
      };

      await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'response_plan_item_updated',
          entity_type: 'critical_incident',
          entity_id: INCIDENT_ID,
          actor_user_id: USER_ID,
        }),
      );
    });
  });

  // ─── addResponsePlanItem ───────────────────────────────────────────────────

  describe('CriticalIncidentResponseService — addResponsePlanItem', () => {
    it('should add item and return plan', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'short_term',
        label: 'Contact board of management',
        description: 'Inform board chair',
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      // Should have added one item to short_term phase
      expect(result.short_term).toHaveLength(2); // 1 existing + 1 new
      const newItem = result.short_term[1];
      expect(newItem?.label).toBe('Contact board of management');
      expect(newItem?.description).toBe('Inform board chair');
      expect(newItem?.id).toBe('mocked-uuid-1111-1111-1111-111111111111');
      expect(newItem?.is_done).toBe(false);
    });

    it('should throw for invalid phase', async () => {
      const dto = {
        phase: 'bogus_phase' as AddResponsePlanItemDto['phase'],
        label: 'Test item',
      };

      await expect(
        service.addResponsePlanItem(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when incident not found', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Test item',
      };

      await expect(
        service.addResponsePlanItem(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fire audit event on add', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'New action item',
      };

      await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'response_plan_item_added',
          entity_type: 'critical_incident',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            phase: 'immediate',
            label: 'New action item',
          }),
        }),
      );
    });
  });

  // ─── getResponsePlanProgress ───────────────────────────────────────────────

  describe('CriticalIncidentResponseService — getResponsePlanProgress', () => {
    it('should return per-phase progress', async () => {
      const plan = makeResponsePlan({
        immediate: [
          makeResponsePlanItem({ is_done: true }),
          makeResponsePlanItem({ id: ITEM_ID_2, is_done: false }),
        ],
        short_term: [
          makeResponsePlanItem({ id: '33333333-3333-3333-3333-333333333333', is_done: true }),
        ],
        medium_term: [],
        long_term: [],
      });
      const incident = makeIncident({ response_plan: plan });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getResponsePlanProgress(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      expect(result).toEqual([
        { phase: 'immediate', total: 2, completed: 1, percentage: 50 },
        { phase: 'short_term', total: 1, completed: 1, percentage: 100 },
        { phase: 'medium_term', total: 0, completed: 0, percentage: 0 },
        { phase: 'long_term', total: 0, completed: 0, percentage: 0 },
      ]);
    });

    it('should handle empty plan', async () => {
      const incident = makeIncident({ response_plan: null });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getResponsePlanProgress(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      expect(result).toEqual([
        { phase: 'immediate', total: 0, completed: 0, percentage: 0 },
        { phase: 'short_term', total: 0, completed: 0, percentage: 0 },
        { phase: 'medium_term', total: 0, completed: 0, percentage: 0 },
        { phase: 'long_term', total: 0, completed: 0, percentage: 0 },
      ]);
    });

    it('should throw when incident not found', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.getResponsePlanProgress(mockDb as unknown as PrismaService, TENANT_ID, INCIDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addExternalSupport ────────────────────────────────────────────────────

  describe('CriticalIncidentResponseService — addExternalSupport', () => {
    it('should add entry and return it', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS Regional Team',
        contact_person: 'Dr Smith',
        visit_date: '2026-03-16',
      };

      const result = await service.addExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.id).toBe('mocked-uuid-1111-1111-1111-111111111111');
      expect(result.provider_type).toBe('neps_ci_team');
      expect(result.provider_name).toBe('NEPS Regional Team');
      expect(result.contact_person).toBe('Dr Smith');
      expect(result.recorded_by_id).toBe(USER_ID);
    });

    it('should throw when incident not found', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      const dto: AddExternalSupportDto = {
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS',
      };

      await expect(
        service.addExternalSupport(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          dto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fire audit event on add', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'external_counsellor',
        provider_name: 'Local Counselling Service',
      };

      await service.addExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'external_support_added',
          entity_type: 'critical_incident',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            provider_type: 'external_counsellor',
            provider_name: 'Local Counselling Service',
          }),
        }),
      );
    });
  });

  // ─── updateExternalSupport ─────────────────────────────────────────────────

  describe('CriticalIncidentResponseService — updateExternalSupport', () => {
    it('should update entry and return it', async () => {
      const existingEntry = makeExternalSupportEntry();
      const incident = makeIncident({ external_support_log: [existingEntry] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto = { outcome_notes: 'Supported 5 students' };

      const result = await service.updateExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        ENTRY_ID,
        USER_ID,
        dto,
      );

      expect(result.outcome_notes).toBe('Supported 5 students');
      expect(result.id).toBe(ENTRY_ID);
      expect(mockDb.criticalIncident.update).toHaveBeenCalled();
    });

    it('should throw EXTERNAL_SUPPORT_ENTRY_NOT_FOUND for missing entry', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.updateExternalSupport(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          'nonexistent-entry-id',
          USER_ID,
          { outcome_notes: 'Test' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when incident not found', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.updateExternalSupport(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          ENTRY_ID,
          USER_ID,
          { outcome_notes: 'Test' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fire audit event on update', async () => {
      const existingEntry = makeExternalSupportEntry();
      const incident = makeIncident({ external_support_log: [existingEntry] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      await service.updateExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        ENTRY_ID,
        USER_ID,
        { outcome_notes: 'Updated notes' },
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'external_support_updated',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            entry_id: ENTRY_ID,
          }),
        }),
      );
    });
  });

  // ─── listExternalSupport ───────────────────────────────────────────────────

  describe('CriticalIncidentResponseService — listExternalSupport', () => {
    it('should return sorted entries', async () => {
      const entryA = makeExternalSupportEntry({
        id: 'entry-a',
        visit_date: '2026-03-16',
        recorded_at: '2026-03-16T08:00:00Z',
      });
      const entryB = makeExternalSupportEntry({
        id: 'entry-b',
        visit_date: '2026-03-17',
        recorded_at: '2026-03-17T08:00:00Z',
      });
      const incident = makeIncident({ external_support_log: [entryA, entryB] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.listExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      // Sorted by visit_date DESC
      expect(result[0]?.id).toBe('entry-b');
      expect(result[1]?.id).toBe('entry-a');
    });

    it('should throw when incident not found', async () => {
      mockDb.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.listExternalSupport(mockDb as unknown as PrismaService, TENANT_ID, INCIDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty array when no external support entries exist', async () => {
      const incident = makeIncident({ external_support_log: null });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.listExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      expect(result).toEqual([]);
    });

    it('should sort by recorded_at when visit_dates are equal', async () => {
      const entryA = makeExternalSupportEntry({
        id: 'entry-a',
        visit_date: '2026-03-16',
        recorded_at: '2026-03-16T08:00:00Z',
      });
      const entryB = makeExternalSupportEntry({
        id: 'entry-b',
        visit_date: '2026-03-16',
        recorded_at: '2026-03-16T12:00:00Z',
      });
      const incident = makeIncident({ external_support_log: [entryA, entryB] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.listExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      // Same visit_date, sorted by recorded_at DESC
      expect(result[0]?.id).toBe('entry-b');
      expect(result[1]?.id).toBe('entry-a');
    });

    it('should sort entries with null visit_dates last', async () => {
      const entryA = makeExternalSupportEntry({
        id: 'entry-a',
        visit_date: null,
        recorded_at: '2026-03-18T08:00:00Z',
      });
      const entryB = makeExternalSupportEntry({
        id: 'entry-b',
        visit_date: '2026-03-16',
        recorded_at: '2026-03-16T08:00:00Z',
      });
      const incident = makeIncident({ external_support_log: [entryA, entryB] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.listExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      // entry-b has a visit_date, entry-a has null (treated as empty string)
      expect(result[0]?.id).toBe('entry-b');
    });
  });

  // ─── updateResponsePlanItem — additional branches ─────────────────────────

  describe('CriticalIncidentResponseService — updateResponsePlanItem additional branches', () => {
    it('should clear completion metadata when is_done is set to false', async () => {
      const doneItem = makeResponsePlanItem({
        is_done: true,
        completed_at: '2026-03-16T10:00:00Z',
        completed_by_id: USER_ID,
        completed_by_name: 'Test User',
      });
      const plan = makeResponsePlan({ immediate: [doneItem] });
      const incident = makeIncident({ response_plan: plan });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        is_done: false,
      };

      const result = await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      const updatedItem = result.immediate[0];
      expect(updatedItem?.is_done).toBe(false);
      expect(updatedItem?.completed_at).toBeNull();
      expect(updatedItem?.completed_by_id).toBeNull();
      expect(updatedItem?.completed_by_name).toBeNull();
    });

    it('should update assigned_to_id on an item', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        assigned_to_id: ASSIGNED_USER_ID,
      };

      const result = await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.immediate[0]?.assigned_to_id).toBe(ASSIGNED_USER_ID);
    });

    it('should not enqueue notification when assigned_to_id is null', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        assigned_to_id: null,
      };

      await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockPastoralQueue.add).not.toHaveBeenCalled();
    });

    it('should not enqueue notification when assigned_to_id is not provided', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        notes: 'Just updating notes',
      };

      await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(mockPastoralQueue.add).not.toHaveBeenCalled();
    });

    it('edge: should handle notification queue failure gracefully', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);
      mockPastoralQueue.add.mockRejectedValue(new Error('Queue down'));

      const dto: UpdateResponsePlanItemDto = {
        phase: 'immediate',
        item_id: ITEM_ID_1,
        assigned_to_id: ASSIGNED_USER_ID,
      };

      // Should not throw — error is caught internally
      const result = await service.updateResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      // Wait for the fire-and-forget catch to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.immediate[0]?.assigned_to_id).toBe(ASSIGNED_USER_ID);
    });

    it('should handle response_plan as non-object', async () => {
      // response_plan is a string (invalid) — should be treated as empty plan
      const incident = makeIncident({ response_plan: 'invalid' });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Test item',
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      // Should have an empty plan with just the new item
      expect(result.immediate).toHaveLength(1);
      expect(result.short_term).toHaveLength(0);
    });

    it('should handle response_plan with non-array phase', async () => {
      // response_plan phases are strings instead of arrays
      const incident = makeIncident({
        response_plan: {
          immediate: 'not-an-array',
          short_term: null,
          medium_term: 42,
          long_term: undefined,
        },
      });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Test item',
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      // Non-array phases should be treated as empty arrays
      expect(result.immediate).toHaveLength(1);
      expect(result.short_term).toHaveLength(0);
      expect(result.medium_term).toHaveLength(0);
      expect(result.long_term).toHaveLength(0);
    });
  });

  // ─── addResponsePlanItem — additional branches ────────────────────────────

  describe('CriticalIncidentResponseService — addResponsePlanItem additional branches', () => {
    it('should add item to medium_term phase', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'medium_term',
        label: 'Ongoing support plan',
        assigned_to_id: ASSIGNED_USER_ID,
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.medium_term).toHaveLength(1);
      expect(result.medium_term[0]?.assigned_to_id).toBe(ASSIGNED_USER_ID);
    });

    it('should add item to long_term phase', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'long_term',
        label: 'Annual review',
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.long_term).toHaveLength(1);
    });

    it('should set default values for new item', async () => {
      const incident = makeIncident();
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddResponsePlanItemDto = {
        phase: 'immediate',
        label: 'Basic item',
      };

      const result = await service.addResponsePlanItem(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      const newItem = result.immediate[result.immediate.length - 1];
      expect(newItem?.description).toBeNull();
      expect(newItem?.assigned_to_id).toBeNull();
      expect(newItem?.assigned_to_name).toBeNull();
      expect(newItem?.is_done).toBe(false);
      expect(newItem?.completed_at).toBeNull();
      expect(newItem?.completed_by_id).toBeNull();
      expect(newItem?.completed_by_name).toBeNull();
      expect(newItem?.notes).toBeNull();
    });
  });

  // ─── updateExternalSupport — additional field branches ────────────────────

  describe('CriticalIncidentResponseService — updateExternalSupport additional branches', () => {
    it('should update all possible fields', async () => {
      const existingEntry = makeExternalSupportEntry();
      const incident = makeIncident({ external_support_log: [existingEntry] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: Partial<AddExternalSupportDto> = {
        provider_type: 'external_counsellor',
        provider_name: 'New Provider',
        contact_person: 'Dr Jones',
        contact_details: '99988877',
        visit_date: '2026-03-20',
        visit_time_start: '14:00',
        visit_time_end: '16:00',
        availability_notes: 'Available weekdays',
        students_seen: ['student-1', 'student-2'],
        outcome_notes: 'Very productive session',
      };

      const result = await service.updateExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        ENTRY_ID,
        USER_ID,
        dto,
      );

      expect(result.provider_type).toBe('external_counsellor');
      expect(result.provider_name).toBe('New Provider');
      expect(result.contact_person).toBe('Dr Jones');
      expect(result.contact_details).toBe('99988877');
      expect(result.visit_date).toBe('2026-03-20');
      expect(result.visit_time_start).toBe('14:00');
      expect(result.visit_time_end).toBe('16:00');
      expect(result.availability_notes).toBe('Available weekdays');
      expect(result.students_seen).toEqual(['student-1', 'student-2']);
      expect(result.outcome_notes).toBe('Very productive session');
    });

    it('should handle clearing optional fields with undefined values', async () => {
      const existingEntry = makeExternalSupportEntry({
        contact_person: 'Dr Smith',
        contact_details: '12345',
        visit_date: '2026-03-16',
        visit_time_start: '09:00',
        visit_time_end: '12:00',
        availability_notes: 'Always available',
        students_seen: ['s1'],
        outcome_notes: 'Good session',
      });
      const incident = makeIncident({ external_support_log: [existingEntry] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      // Only update provider_name — all other fields should remain unchanged
      const result = await service.updateExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        ENTRY_ID,
        USER_ID,
        { provider_name: 'Updated Name' },
      );

      expect(result.provider_name).toBe('Updated Name');
      expect(result.contact_person).toBe('Dr Smith');
      expect(result.visit_date).toBe('2026-03-16');
    });

    it('should handle external_support_log that is not an array', async () => {
      const incident = makeIncident({ external_support_log: 'not-an-array' });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      await expect(
        service.updateExternalSupport(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          INCIDENT_ID,
          ENTRY_ID,
          USER_ID,
          { outcome_notes: 'Test' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addExternalSupport — additional branches ─────────────────────────────

  describe('CriticalIncidentResponseService — addExternalSupport additional branches', () => {
    it('should set default null values for optional fields', async () => {
      const incident = makeIncident({ external_support_log: [] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'neps_ci_team',
        provider_name: 'NEPS',
      };

      const result = await service.addExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.contact_person).toBeNull();
      expect(result.contact_details).toBeNull();
      expect(result.visit_date).toBeNull();
      expect(result.visit_time_start).toBeNull();
      expect(result.visit_time_end).toBeNull();
      expect(result.availability_notes).toBeNull();
      expect(result.students_seen).toEqual([]);
      expect(result.outcome_notes).toBeNull();
    });

    it('should append to existing external support log', async () => {
      const existingEntry = makeExternalSupportEntry({ id: 'existing-entry' });
      const incident = makeIncident({ external_support_log: [existingEntry] });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);
      mockDb.criticalIncident.update.mockResolvedValue(incident);

      const dto: AddExternalSupportDto = {
        provider_type: 'external_counsellor',
        provider_name: 'New Provider',
        students_seen: ['student-1'],
        outcome_notes: 'Session notes',
      };

      const result = await service.addExternalSupport(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );

      expect(result.students_seen).toEqual(['student-1']);
      expect(result.outcome_notes).toBe('Session notes');

      // Verify the update was called with both entries
      const updateCall = mockDb.criticalIncident.update.mock.calls[0]![0] as {
        data: { external_support_log: unknown };
      };
      const log = updateCall.data.external_support_log as ExternalSupportEntry[];
      expect(log).toHaveLength(2);
    });
  });

  // ─── getResponsePlanProgress — additional branches ────────────────────────

  describe('CriticalIncidentResponseService — getResponsePlanProgress additional branches', () => {
    it('should handle plan with non-object response_plan', async () => {
      const incident = makeIncident({ response_plan: 'not-an-object' });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getResponsePlanProgress(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      // All phases should be empty
      for (const phase of result) {
        expect(phase.total).toBe(0);
        expect(phase.completed).toBe(0);
        expect(phase.percentage).toBe(0);
      }
    });

    it('should calculate percentage correctly for fully completed phase', async () => {
      const plan = makeResponsePlan({
        immediate: [
          makeResponsePlanItem({ is_done: true }),
          makeResponsePlanItem({ id: ITEM_ID_2, is_done: true }),
        ],
      });
      const incident = makeIncident({ response_plan: plan });
      mockDb.criticalIncident.findFirst.mockResolvedValue(incident);

      const result = await service.getResponsePlanProgress(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
      );

      const immediate = result.find((p) => p.phase === 'immediate');
      expect(immediate?.percentage).toBe(100);
      expect(immediate?.total).toBe(2);
      expect(immediate?.completed).toBe(2);
    });
  });
});
