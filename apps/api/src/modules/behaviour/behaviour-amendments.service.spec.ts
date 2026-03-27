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

const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
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
    it('should mark original document superseded and set correction_notification_sent', async () => {
      const notice = {
        id: 'amendment-5',
        tenant_id: TENANT_ID,
        entity_type: 'sanction',
        entity_id: SANCTION_ID,
        correction_notification_sent: false,
        requires_parent_reacknowledgement: false,
      };
      mockRlsTx.behaviourAmendmentNotice!.findFirst.mockResolvedValue(notice);
      mockRlsTx.behaviourAmendmentNotice!.update.mockResolvedValue({
        ...notice,
        correction_notification_sent: true,
      });

      const result = await service.sendCorrection(TENANT_ID, 'amendment-5', USER_ID);

      expect(result.correction_notification_sent).toBe(true);
      expect(mockRlsTx.behaviourAmendmentNotice!.update).toHaveBeenCalledWith({
        where: { id: 'amendment-5' },
        data: expect.objectContaining({
          correction_notification_sent: true,
        }),
      });
    });
  });
});
