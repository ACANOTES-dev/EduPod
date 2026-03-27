import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourAmendmentsService } from './behaviour-amendments.service';
import { BehaviourAppealsService } from './behaviour-appeals.service';
import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const SANCTION_ID = 'sanction-1';
const STUDENT_ID = 'student-1';
const APPEAL_ID = 'appeal-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourAppeal: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  behaviourIncident: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  behaviourExclusionCase: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  behaviourLegalHold: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
    findFirst: jest.fn(),
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

describe('BehaviourAppealsService', () => {
  let service: BehaviourAppealsService;
  let mockSequenceService: { nextNumber: jest.Mock };
  let mockHistoryService: { recordHistory: jest.Mock };
  let mockAmendmentsService: { createAmendmentNotice: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockSequenceService = {
      nextNumber: jest.fn().mockResolvedValue('AP-202603-000001'),
    };
    mockHistoryService = {
      recordHistory: jest.fn().mockResolvedValue(undefined),
    };
    mockAmendmentsService = {
      createAmendmentNotice: jest.fn().mockResolvedValue({ id: 'amendment-1' }),
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
        BehaviourAppealsService,
        { provide: PrismaService, useValue: {} },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: BehaviourAmendmentsService, useValue: mockAmendmentsService },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<BehaviourAppealsService>(BehaviourAppealsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submit ─────────────────────────────────────────────────────────────────

  describe('submit', () => {
    const baseDto = {
      entity_type: 'sanction' as const,
      incident_id: INCIDENT_ID,
      sanction_id: SANCTION_ID,
      student_id: STUDENT_ID,
      appellant_type: 'parent' as const,
      appellant_parent_id: 'parent-1',
      grounds: 'Unfair sanction',
      grounds_category: 'disproportionate_consequence' as const,
    };

    function setupSubmitMocks(overrides?: {
      sanctionStatus?: string;
      existingAppeal?: unknown;
    }) {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        tenant_id: TENANT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue({
        id: SANCTION_ID,
        tenant_id: TENANT_ID,
        status: overrides?.sanctionStatus ?? 'scheduled',
      });
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(
        overrides?.existingAppeal ?? null,
      );
      mockRlsTx.behaviourAppeal!.create.mockResolvedValue({
        id: APPEAL_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
      });
      mockRlsTx.behaviourLegalHold!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold!.create.mockResolvedValue({ id: 'hold-1' });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourTask!.create.mockResolvedValue({ id: 'task-1' });
    }

    it('should generate AP- sequence number on submission', async () => {
      setupSubmitMocks();

      const result = await service.submit(TENANT_ID, USER_ID, baseDto) as { appeal_number: string };

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'behaviour_appeal',
        mockRlsTx,
        'AP',
      );
      expect(result.appeal_number).toBe('AP-202603-000001');
    });

    it('should transition linked sanction to appealed on submission', async () => {
      setupSubmitMocks({ sanctionStatus: 'scheduled' });

      await service.submit(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: { status: 'appealed' },
      });
    });

    it('should reject submission if open appeal already exists for the sanction', async () => {
      setupSubmitMocks({
        existingAppeal: { id: 'existing-appeal', status: 'submitted' },
      });

      await expect(
        service.submit(TENANT_ID, USER_ID, baseDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set legal hold on incident and sanction on submission', async () => {
      setupSubmitMocks();

      await service.submit(TENANT_ID, USER_ID, baseDto);

      // Legal holds should be created for incident, sanction, and appeal
      const createCalls = mockRlsTx.behaviourLegalHold!.create.mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(2);

      const entityTypes = createCalls.map(
        (call: [{ data: { entity_type: string } }]) => call[0].data.entity_type,
      );
      expect(entityTypes).toContain('incident');
      expect(entityTypes).toContain('sanction');
    });
  });

  // ─── decide ─────────────────────────────────────────────────────────────────

  describe('decide', () => {
    function setupDecideMocks(overrides?: {
      sanctionStatus?: string;
      incidentStatus?: string;
      exclusionCases?: unknown[];
    }) {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'under_review',
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        incident: {
          id: INCIDENT_ID,
          status: overrides?.incidentStatus ?? 'confirmed',
        },
        sanction: {
          id: SANCTION_ID,
          status: overrides?.sanctionStatus ?? 'appealed',
          scheduled_date: '2026-04-01',
        },
        exclusion_cases: overrides?.exclusionCases ?? [],
      });
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({
        id: SANCTION_ID,
        status: 'scheduled',
      });
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({
        id: INCIDENT_ID,
        status: 'closed_after_appeal',
      });
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'decided',
      });
    }

    it('should apply upheld_original: revert sanction from appealed to scheduled', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'upheld_original',
        decision_reasoning: 'Decision stands',
      });

      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({
          status: 'scheduled',
          appeal_outcome: 'upheld',
        }),
      });
    });

    it('should apply overturned: cancel sanction and set incident to closed_after_appeal', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'overturned',
        decision_reasoning: 'Sanction was disproportionate',
      });

      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({
          status: 'cancelled',
          appeal_outcome: 'overturned_appeal',
        }),
      });

      expect(mockRlsTx.behaviourIncident!.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'closed_after_appeal' },
      });
    });

    it('should apply modified: update sanction field and set appeal outcome to modified_appeal', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'modified',
        decision_reasoning: 'Sanction reduced',
        amendments: [
          {
            entity_type: 'sanction',
            entity_id: SANCTION_ID,
            field: 'scheduled_date',
            new_value: '2026-04-15',
          },
        ],
      });

      // Field-level update on sanction
      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SANCTION_ID },
          data: { scheduled_date: '2026-04-15' },
        }),
      );

      // Appeal outcome on sanction
      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SANCTION_ID },
          data: expect.objectContaining({
            status: 'scheduled',
            appeal_outcome: 'modified_appeal',
          }),
        }),
      );
    });

    it('should auto-create amendment notices when decision modifies parent-visible fields', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'modified',
        decision_reasoning: 'Date adjusted',
        amendments: [
          {
            entity_type: 'sanction',
            entity_id: SANCTION_ID,
            field: 'scheduled_date',
            new_value: '2026-04-15',
          },
        ],
      });

      expect(mockAmendmentsService.createAmendmentNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          entityType: 'sanction',
          entityId: SANCTION_ID,
          amendmentType: 'correction',
        }),
      );
    });

    it('edge: decide endpoint must be atomic - if amendment notice creation fails, entire transaction rolls back', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });
      mockAmendmentsService.createAmendmentNotice.mockRejectedValue(
        new Error('Amendment DB failure'),
      );

      await expect(
        service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
          decision: 'modified',
          decision_reasoning: 'Adjusted',
          amendments: [
            {
              entity_type: 'sanction',
              entity_id: SANCTION_ID,
              field: 'scheduled_date',
              new_value: '2026-04-15',
            },
          ],
        }),
      ).rejects.toThrow('Amendment DB failure');
    });
  });
});
