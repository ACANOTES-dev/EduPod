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
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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

      const result = await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID) as { correction_notification_sent: boolean };

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
          template_key: 'behaviour.correction_parent',
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
          template_key: 'behaviour.reacknowledgement_request',
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
  });
});
