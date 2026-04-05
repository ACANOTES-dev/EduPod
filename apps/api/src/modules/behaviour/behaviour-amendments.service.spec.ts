import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAmendmentsService } from './behaviour-amendments.service';
import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const SANCTION_ID = 'sanction-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourAmendmentNotice: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
  },
  behaviourIncidentParticipant: {
    findFirst: jest.fn(),
  },
  studentParent: {
    findMany: jest.fn(),
  },
  behaviourParentAcknowledgement: {
    create: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
  behaviourDocument: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourAmendmentsService', () => {
  let service: BehaviourAmendmentsService;
  let mockHistoryService: { recordHistory: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockHistoryService = {
      recordHistory: jest.fn().mockResolvedValue(undefined),
    };
    mockQueue = { add: jest.fn().mockResolvedValue({}) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const method of Object.values(model)) {
        method.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAmendmentsService,
        { provide: PrismaService, useValue: {} },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<BehaviourAmendmentsService>(BehaviourAmendmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkAndCreateAmendment ──────────────────────────────────────────────

  describe('checkAndCreateAmendment', () => {
    it('should create amendment notice when parent-notified incident category is changed', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-1',
        entity_type: 'incident',
        requires_parent_reacknowledgement: true,
      });

      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { category_id: 'cat-old' },
        newValues: { category_id: 'cat-new' },
        reason: 'Category corrected',
        parentNotificationStatus: 'sent',
      });

      expect(result).toBe(true);
      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          entity_type: 'incident',
          entity_id: INCIDENT_ID,
          amendment_type: 'correction',
        }),
      });
    });

    it('should create amendment notice when parent-notified sanction date is changed', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-2',
        entity_type: 'sanction',
        requires_parent_reacknowledgement: false,
      });

      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'sanction',
        entityId: SANCTION_ID,
        changedById: USER_ID,
        previousValues: { scheduled_date: '2026-03-01' },
        newValues: { scheduled_date: '2026-04-01' },
        reason: 'Date adjusted',
        parentNotificationStatus: 'delivered',
      });

      expect(result).toBe(true);
      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalled();
    });

    it('should not create amendment notice if notification was not yet sent', async () => {
      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { category_id: 'cat-old' },
        newValues: { category_id: 'cat-new' },
        reason: 'Category corrected',
        parentNotificationStatus: 'pending',
      });

      expect(result).toBe(false);
      expect(mockRlsTx.behaviourAmendmentNotice!.create).not.toHaveBeenCalled();
    });
  });

  // ─── createAmendmentNotice ────────────────────────────────────────────────

  describe('createAmendmentNotice', () => {
    it('should record authorised_by_id when behaviour.manage unlocks locked description', async () => {
      const authorisedById = 'admin-1';
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-3',
        authorised_by_id: authorisedById,
      });

      await service.createAmendmentNotice({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        authorisedById,
        previousValues: { parent_description: 'old text' },
        newValues: { parent_description: 'new text' },
        reason: 'Description unlocked by admin',
        amendmentType: 'correction',
      });

      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          authorised_by_id: authorisedById,
        }),
      });
    });

    it('should set requires_parent_reacknowledgement=true when severity >= threshold', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-4',
        requires_parent_reacknowledgement: true,
      });

      await service.createAmendmentNotice({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { category_id: 'cat-old' },
        newValues: { category_id: 'cat-new' },
        reason: 'Category changed',
        amendmentType: 'correction',
      });

      // category_id is in HIGH_SEVERITY_FIELDS, so requires_parent_reacknowledgement=true
      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requires_parent_reacknowledgement: true,
        }),
      });
    });
  });

  // ─── sendCorrection ──────────────────────────────────────────────────────

  describe('sendCorrection', () => {
    const PARENT_ID = 'parent-1';
    const PARENT_USER_ID = 'parent-user-1';
    const STUDENT_ID = 'student-1';

    function setupSanctionNotice(overrides?: Record<string, unknown>) {
      const notice = {
        id: 'amendment-5',
        tenant_id: TENANT_ID,
        entity_type: 'sanction',
        entity_id: SANCTION_ID,
        correction_notification_sent: false,
        requires_parent_reacknowledgement: false,
        change_reason: 'Date corrected',
        ...overrides,
      };
      mockRlsTx.behaviourAmendmentNotice!.findFirst.mockResolvedValue(notice);
      mockRlsTx.behaviourAmendmentNotice!.update.mockResolvedValue({
        ...notice,
        correction_notification_sent: true,
      });
      // Resolve entity refs — sanction path
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue({
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
      });
      return notice;
    }

    function setupParents(parents?: Array<{ id: string; user_id: string | null; status: string }>) {
      const defaultParents = parents ?? [
        { id: PARENT_ID, user_id: PARENT_USER_ID, status: 'active' },
      ];
      mockRlsTx.studentParent!.findMany.mockResolvedValue(
        defaultParents.map((p) => ({ parent: p })),
      );
    }

    it('should set correction_notification_sent and resolve entity references for a sanction', async () => {
      setupSanctionNotice();
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      const result = (await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID)) as {
        correction_notification_sent: boolean;
      };

      expect(result.correction_notification_sent).toBe(true);
      expect(mockRlsTx.behaviourSanction!.findFirst).toHaveBeenCalledWith({
        where: { id: SANCTION_ID, tenant_id: TENANT_ID },
        select: { student_id: true, incident_id: true },
      });
    });

    it('should create parent acknowledgement row for each active parent', async () => {
      setupSanctionNotice();
      setupParents();
      mockRlsTx.behaviourParentAcknowledgement!.create.mockResolvedValue({});
      mockRlsTx.notification!.create.mockResolvedValue({});
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourParentAcknowledgement!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          sanction_id: SANCTION_ID,
          amendment_notice_id: 'amendment-5',
          parent_id: PARENT_ID,
          channel: 'in_app',
        }),
      });
    });

    it('should create in-app notification with correction_parent template', async () => {
      setupSanctionNotice({ requires_parent_reacknowledgement: false });
      setupParents();
      mockRlsTx.behaviourParentAcknowledgement!.create.mockResolvedValue({});
      mockRlsTx.notification!.create.mockResolvedValue({});
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.notification!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: PARENT_USER_ID,
          channel: 'in_app',
          template_key: 'behaviour_correction_parent',
          status: 'delivered',
        }),
      });
    });

    it('should use reacknowledgement_request template when re-ack required', async () => {
      setupSanctionNotice({ requires_parent_reacknowledgement: true });
      setupParents();
      mockRlsTx.behaviourParentAcknowledgement!.create.mockResolvedValue({});
      mockRlsTx.notification!.create.mockResolvedValue({});
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.notification!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'behaviour_reacknowledgement_request',
        }),
      });
    });

    it('should skip inactive parents', async () => {
      setupSanctionNotice();
      setupParents([{ id: PARENT_ID, user_id: PARENT_USER_ID, status: 'inactive' }]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourParentAcknowledgement!.create).not.toHaveBeenCalled();
      expect(mockRlsTx.notification!.create).not.toHaveBeenCalled();
    });

    it('should skip notification when parent has no user_id', async () => {
      setupSanctionNotice();
      setupParents([{ id: PARENT_ID, user_id: null, status: 'active' }]);
      mockRlsTx.behaviourParentAcknowledgement!.create.mockResolvedValue({});
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      // Ack row should still be created
      expect(mockRlsTx.behaviourParentAcknowledgement!.create).toHaveBeenCalled();
      // But no notification
      expect(mockRlsTx.notification!.create).not.toHaveBeenCalled();
    });

    it('should supersede the most recent sent document for the entity', async () => {
      setupSanctionNotice();
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue({
        id: 'doc-99',
        status: 'sent_doc',
      });
      mockRlsTx.behaviourDocument!.update.mockResolvedValue({});

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourDocument!.update).toHaveBeenCalledWith({
        where: { id: 'doc-99' },
        data: {
          status: 'superseded',
          superseded_reason: 'Amendment: Date corrected',
        },
      });
    });

    it('should not supersede when no sent document exists', async () => {
      setupSanctionNotice();
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourDocument!.update).not.toHaveBeenCalled();
    });

    it('should resolve incident entity via subject participant', async () => {
      const notice = {
        id: 'amendment-6',
        tenant_id: TENANT_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        correction_notification_sent: false,
        requires_parent_reacknowledgement: false,
        change_reason: 'Description corrected',
      };
      mockRlsTx.behaviourAmendmentNotice!.findFirst.mockResolvedValue(notice);
      mockRlsTx.behaviourAmendmentNotice!.update.mockResolvedValue({
        ...notice,
        correction_notification_sent: true,
      });
      mockRlsTx.behaviourIncidentParticipant!.findFirst.mockResolvedValue({
        student_id: STUDENT_ID,
      });
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-6', USER_ID);

      expect(mockRlsTx.behaviourIncidentParticipant!.findFirst).toHaveBeenCalledWith({
        where: {
          incident_id: INCIDENT_ID,
          tenant_id: TENANT_ID,
          role: 'subject',
          student_id: { not: null },
        },
        select: { student_id: true },
      });
    });

    it('should enqueue re-ack job when requires_parent_reacknowledgement is true', async () => {
      setupSanctionNotice({ requires_parent_reacknowledgement: true });
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'behaviour:parent-reacknowledgement',
        expect.objectContaining({ amendment_notice_id: 'amendment-5' }),
      );
    });

    it('should throw NotFoundException when amendment notice not found', async () => {
      mockRlsTx.behaviourAmendmentNotice!.findFirst.mockResolvedValue(null);

      await expect(service.sendCorrection(TENANT_ID, 'missing-id', USER_ID)).rejects.toThrow(
        'Amendment notice not found',
      );
    });

    it('should resolve unknown entity type with null refs', async () => {
      const notice = {
        id: 'amendment-7',
        tenant_id: TENANT_ID,
        entity_type: 'unknown_type',
        entity_id: 'some-id',
        correction_notification_sent: false,
        requires_parent_reacknowledgement: false,
        change_reason: 'test',
      };
      mockRlsTx.behaviourAmendmentNotice!.findFirst.mockResolvedValue(notice);
      mockRlsTx.behaviourAmendmentNotice!.update.mockResolvedValue({
        ...notice,
        correction_notification_sent: true,
      });
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      // Unknown entity type returns null studentId, so no parent lookup
      await service.sendCorrection(TENANT_ID, 'amendment-7', USER_ID);

      expect(mockRlsTx.studentParent!.findMany).not.toHaveBeenCalled();
    });

    it('edge: should continue when parent acknowledgement creation fails', async () => {
      setupSanctionNotice();
      setupParents();
      mockRlsTx.behaviourParentAcknowledgement!.create.mockRejectedValue(
        new Error('DB constraint'),
      );
      mockRlsTx.notification!.create.mockResolvedValue({});
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      // Should not throw - error is caught and logged
      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalled();
    });

    it('edge: should continue when notification creation fails', async () => {
      setupSanctionNotice();
      setupParents();
      mockRlsTx.behaviourParentAcknowledgement!.create.mockResolvedValue({});
      mockRlsTx.notification!.create.mockRejectedValue(new Error('Notification failure'));
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalled();
    });

    it('edge: should continue when document supersession fails', async () => {
      setupSanctionNotice();
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockRejectedValue(new Error('Document query failed'));

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalled();
    });

    it('edge: should continue when correction-parent queue fails', async () => {
      setupSanctionNotice();
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);
      mockQueue.add.mockRejectedValue(new Error('Queue down'));

      // Should not throw
      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalled();
    });

    it('edge: should continue when re-ack queue fails', async () => {
      setupSanctionNotice({ requires_parent_reacknowledgement: true });
      setupParents([]);
      mockRlsTx.behaviourDocument!.findFirst.mockResolvedValue(null);
      mockQueue.add
        .mockResolvedValueOnce({}) // correction-parent succeeds
        .mockRejectedValueOnce(new Error('Queue down')); // re-ack fails

      await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalled();
    });
  });

  // ─── checkAndCreateAmendment — additional branches ────────────────────────

  describe('checkAndCreateAmendment — additional branches', () => {
    it('should return false when no parentNotificationStatus provided', async () => {
      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { category_id: 'old' },
        newValues: { category_id: 'new' },
        reason: 'test',
      });

      expect(result).toBe(false);
    });

    it('should return false when no parent-visible fields changed', async () => {
      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { internal_notes: 'old' },
        newValues: { internal_notes: 'new' },
        reason: 'test',
        parentNotificationStatus: 'sent',
      });

      expect(result).toBe(false);
    });

    it('should return false when parent-visible field has same old and new value', async () => {
      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { category_id: 'same' },
        newValues: { category_id: 'same' },
        reason: 'test',
        parentNotificationStatus: 'acknowledged',
      });

      expect(result).toBe(false);
    });

    it('should use custom parentVisibleFields when provided', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-custom',
        requires_parent_reacknowledgement: false,
      });

      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'sanction',
        entityId: SANCTION_ID,
        changedById: USER_ID,
        previousValues: { custom_field: 'old' },
        newValues: { custom_field: 'new' },
        reason: 'test',
        parentNotificationStatus: 'delivered',
        parentVisibleFields: ['custom_field'],
      });

      expect(result).toBe(true);
    });

    it('should return empty fields for unknown entity type', async () => {
      const result = await service.checkAndCreateAmendment({
        tenantId: TENANT_ID,
        entityType: 'unknown_entity',
        entityId: 'id-1',
        changedById: USER_ID,
        previousValues: { field1: 'old' },
        newValues: { field1: 'new' },
        reason: 'test',
        parentNotificationStatus: 'sent',
      });

      // Unknown entity type returns [] from getParentVisibleFields, no visible change
      expect(result).toBe(false);
    });
  });

  // ─── createAmendmentNotice — no parent-visible changes ────────────────────

  describe('createAmendmentNotice — no visible changes', () => {
    it('should return null when no parent-visible fields changed', async () => {
      const result = await service.createAmendmentNotice({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { internal_notes: 'old' },
        newValues: { internal_notes: 'new' },
        reason: 'Notes updated',
        amendmentType: 'correction',
      });

      expect(result).toBeNull();
      expect(mockRlsTx.behaviourAmendmentNotice!.create).not.toHaveBeenCalled();
    });

    it('should set requires_parent_reacknowledgement=false when only non-severity fields change', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-x',
        requires_parent_reacknowledgement: false,
      });

      await service.createAmendmentNotice({
        tenantId: TENANT_ID,
        entityType: 'incident',
        entityId: INCIDENT_ID,
        changedById: USER_ID,
        previousValues: { parent_description: 'old text' },
        newValues: { parent_description: 'new text' },
        reason: 'Description corrected',
        amendmentType: 'correction',
      });

      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requires_parent_reacknowledgement: false,
        }),
      });
    });

    it('should handle sanction parent-visible fields correctly', async () => {
      mockRlsTx.behaviourAmendmentNotice!.create.mockResolvedValue({
        id: 'amendment-san',
        requires_parent_reacknowledgement: true,
      });

      await service.createAmendmentNotice({
        tenantId: TENANT_ID,
        entityType: 'sanction',
        entityId: SANCTION_ID,
        changedById: USER_ID,
        previousValues: { type: 'detention' },
        newValues: { type: 'suspension_external' },
        reason: 'Sanction type changed',
        amendmentType: 'correction',
      });

      // 'type' is in HIGH_SEVERITY_FIELDS so requires_parent_reacknowledgement should be true
      expect(mockRlsTx.behaviourAmendmentNotice!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requires_parent_reacknowledgement: true,
        }),
      });
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    let mockGetByIdPrisma: {
      behaviourAmendmentNotice: {
        findFirst: jest.Mock;
      };
    };

    beforeEach(() => {
      mockGetByIdPrisma = {
        behaviourAmendmentNotice: {
          findFirst: jest.fn(),
        },
      };
      (service as unknown as { prisma: unknown }).prisma = mockGetByIdPrisma;
    });

    it('should throw NotFoundException when notice not found', async () => {
      mockGetByIdPrisma.behaviourAmendmentNotice.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, 'bad-id')).rejects.toThrow(
        'Amendment notice not found',
      );
    });

    it('should return notice when found', async () => {
      const notice = { id: 'amendment-1', tenant_id: TENANT_ID };
      mockGetByIdPrisma.behaviourAmendmentNotice.findFirst.mockResolvedValue(notice);

      const result = await service.getById(TENANT_ID, 'amendment-1');

      expect(result).toEqual(notice);
    });
  });

  // ─── list — filter branches ───────────────────────────────────────────────

  describe('list — filter branches', () => {
    let mockListPrisma: {
      behaviourAmendmentNotice: {
        findMany: jest.Mock;
        count: jest.Mock;
      };
    };

    beforeEach(() => {
      mockListPrisma = {
        behaviourAmendmentNotice: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      (service as unknown as { prisma: unknown }).prisma = mockListPrisma;
    });

    it('should filter by entity_type', async () => {
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        entity_type: 'incident',
      });

      expect(mockListPrisma.behaviourAmendmentNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_type: 'incident',
          }),
        }),
      );
    });

    it('should filter by amendment_type', async () => {
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        amendment_type: 'correction',
      });

      expect(mockListPrisma.behaviourAmendmentNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            amendment_type: 'correction',
          }),
        }),
      );
    });

    it('should filter by correction_sent', async () => {
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        correction_sent: true,
      });

      expect(mockListPrisma.behaviourAmendmentNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            correction_notification_sent: true,
          }),
        }),
      );
    });
  });

  // ─── getPending ───────────────────────────────────────────────────────────

  describe('getPending', () => {
    let mockPendingPrisma: {
      behaviourAmendmentNotice: {
        findMany: jest.Mock;
        count: jest.Mock;
      };
    };

    beforeEach(() => {
      mockPendingPrisma = {
        behaviourAmendmentNotice: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      (service as unknown as { prisma: unknown }).prisma = mockPendingPrisma;
    });

    it('should return paginated unsent corrections', async () => {
      mockPendingPrisma.behaviourAmendmentNotice.findMany.mockResolvedValue([{ id: 'a-1' }]);
      mockPendingPrisma.behaviourAmendmentNotice.count.mockResolvedValue(1);

      const result = await service.getPending(TENANT_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockPendingPrisma.behaviourAmendmentNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            correction_notification_sent: false,
          },
        }),
      );
    });
  });
});
