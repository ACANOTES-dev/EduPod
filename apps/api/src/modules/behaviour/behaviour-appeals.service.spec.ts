import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

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
    $transaction: jest.fn().mockImplementation(async (fn) => fn(mockRlsTx)),
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

    function setupSubmitMocks(overrides?: { sanctionStatus?: string; existingAppeal?: unknown }) {
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
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(overrides?.existingAppeal ?? null);
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

      const result = (await service.submit(TENANT_ID, USER_ID, baseDto)) as {
        appeal_number: string;
      };

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

      await expect(service.submit(TENANT_ID, USER_ID, baseDto)).rejects.toThrow(
        BadRequestException,
      );
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
        student_id: STUDENT_ID,
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

    it('should use 15s transaction timeout guard (DZ-17)', async () => {
      setupDecideMocks({ sanctionStatus: 'appealed' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRlsClient } = require('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      const rlsReturnValue = createRlsClient() as { $transaction: jest.Mock };
      const mockTxFn = rlsReturnValue.$transaction;

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'upheld_original',
        decision_reasoning: 'Decision stands',
      });

      // The decide method calls $transaction with the callback and { timeout: 15000 }
      const txCalls = mockTxFn.mock.calls;
      const decideCall = txCalls[txCalls.length - 1];
      expect(decideCall[1]).toEqual({ timeout: 15000 });
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

  // ─── blocked transitions ──────────────────────────────────────────────

  describe('blocked transitions', () => {
    it('should reject decided -> withdraw (terminal status)', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        status: 'decided',
        sanction_id: SANCTION_ID,
        sanction: { id: SANCTION_ID, status: 'scheduled' },
      });

      await expect(
        service.withdraw(TENANT_ID, APPEAL_ID, USER_ID, { reason: 'Changed mind' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject withdrawn_appeal -> withdraw (terminal status)', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        status: 'withdrawn_appeal',
        sanction_id: SANCTION_ID,
        sanction: { id: SANCTION_ID, status: 'scheduled' },
      });

      await expect(
        service.withdraw(TENANT_ID, APPEAL_ID, USER_ID, { reason: 'Try again' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject decided -> decide again (terminal status)', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'decided',
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        incident: { id: INCIDENT_ID, status: 'confirmed' },
        sanction: { id: SANCTION_ID, status: 'scheduled' },
        exclusion_cases: [],
      });

      await expect(
        service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
          decision: 'overturned',
          decision_reasoning: 'Re-deciding',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject withdrawn_appeal -> decide (terminal status)', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'withdrawn_appeal',
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        incident: { id: INCIDENT_ID, status: 'confirmed' },
        sanction: { id: SANCTION_ID, status: 'scheduled' },
        exclusion_cases: [],
      });

      await expect(
        service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
          decision: 'upheld_original',
          decision_reasoning: 'Deciding after withdrawal',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submit — incident-level appeal (no sanction) ────────────────────────

  describe('submit — incident-level appeal', () => {
    it('should create appeal without sanction validation when entity_type=incident', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        tenant_id: TENANT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourAppeal!.create.mockResolvedValue({
        id: APPEAL_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
      });
      mockRlsTx.behaviourLegalHold!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold!.create.mockResolvedValue({ id: 'hold-1' });
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.submit(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        incident_id: INCIDENT_ID,
        student_id: STUDENT_ID,
        appellant_type: 'parent',
        appellant_parent_id: 'parent-1',
        grounds: 'Not fair',
        grounds_category: 'disproportionate_consequence',
      });

      expect(mockRlsTx.behaviourSanction!.findFirst).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourAppeal!.create).toHaveBeenCalled();
    });
  });

  // ─── submit — entity_type=sanction without sanction_id ────────────────────

  describe('submit — missing sanction_id', () => {
    it('should throw BadRequestException when entity_type=sanction but no sanction_id', async () => {
      await expect(
        service.submit(TENANT_ID, USER_ID, {
          entity_type: 'sanction',
          incident_id: INCIDENT_ID,
          student_id: STUDENT_ID,
          appellant_type: 'parent',
          grounds: 'Test',
          grounds_category: 'disproportionate_consequence',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submit — incident not found ────────────────────────────────────────

  describe('submit — incident not found', () => {
    it('should throw NotFoundException when incident does not exist', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, USER_ID, {
          entity_type: 'incident',
          incident_id: 'bad-id',
          student_id: STUDENT_ID,
          appellant_type: 'parent',
          grounds: 'Test',
          grounds_category: 'other',
        }),
      ).rejects.toThrow('Incident not found');
    });
  });

  // ─── submit — sanction not found ────────────────────────────────────────

  describe('submit — sanction not found', () => {
    it('should throw NotFoundException when sanction does not exist', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, USER_ID, {
          entity_type: 'sanction',
          incident_id: INCIDENT_ID,
          sanction_id: 'bad-id',
          student_id: STUDENT_ID,
          appellant_type: 'parent',
          grounds: 'Test',
          grounds_category: 'other',
        }),
      ).rejects.toThrow('Sanction not found');
    });
  });

  // ─── submit — sanction not in scheduled status ────────────────────────────

  describe('submit — sanction not scheduled', () => {
    it('should not transition sanction when it is not in scheduled status', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue({
        id: SANCTION_ID,
        status: 'served',
      });
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal!.create.mockResolvedValue({
        id: APPEAL_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
      });
      mockRlsTx.behaviourLegalHold!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold!.create.mockResolvedValue({});
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.submit(TENANT_ID, USER_ID, {
        entity_type: 'sanction',
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        student_id: STUDENT_ID,
        appellant_type: 'student',
        grounds: 'Test',
        grounds_category: 'other',
      });

      // Sanction should NOT be updated to 'appealed' since it's not 'scheduled'
      expect(mockRlsTx.behaviourSanction!.update).not.toHaveBeenCalled();
    });
  });

  // ─── submit — existing legal hold ────────────────────────────────────────

  describe('submit — existing legal hold', () => {
    it('should not create duplicate legal hold when one already exists', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal!.create.mockResolvedValue({
        id: APPEAL_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
      });
      // Return existing hold for all lookups
      mockRlsTx.behaviourLegalHold!.findFirst.mockResolvedValue({ id: 'existing-hold' });
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.submit(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        incident_id: INCIDENT_ID,
        student_id: STUDENT_ID,
        appellant_type: 'parent',
        grounds: 'Test',
        grounds_category: 'other',
      });

      expect(mockRlsTx.behaviourLegalHold!.create).not.toHaveBeenCalled();
    });
  });

  // ─── submit — links to exclusion case ─────────────────────────────────────

  describe('submit — links to exclusion case', () => {
    it('should set appeal_id on exclusion case when one exists for the sanction', async () => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        status: 'confirmed',
      });
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue({
        id: SANCTION_ID,
        status: 'scheduled',
      });
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal!.create.mockResolvedValue({
        id: APPEAL_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
      });
      mockRlsTx.behaviourLegalHold!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold!.create.mockResolvedValue({});
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue({
        id: 'exc-1',
        sanction_id: SANCTION_ID,
        appeal_id: null,
      });
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.submit(TENANT_ID, USER_ID, {
        entity_type: 'sanction',
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        student_id: STUDENT_ID,
        appellant_type: 'parent',
        grounds: 'Test',
        grounds_category: 'other',
      });

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith({
        where: { id: 'exc-1' },
        data: { appeal_id: APPEAL_ID },
      });
    });
  });

  // ─── update — branch coverage ────────────────────────────────────────────

  describe('update', () => {
    it('should throw NotFoundException when appeal not found', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, APPEAL_ID, { reviewer_id: 'rev-1' }, USER_ID),
      ).rejects.toThrow('Appeal not found');
    });

    it('should throw BadRequestException when appeal is decided', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        status: 'decided',
      });

      await expect(
        service.update(TENANT_ID, APPEAL_ID, { reviewer_id: 'rev-1' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when appeal is withdrawn', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        status: 'withdrawn_appeal',
      });

      await expect(
        service.update(TENANT_ID, APPEAL_ID, { reviewer_id: 'rev-1' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return unchanged appeal when no new values', async () => {
      const appeal = {
        id: APPEAL_ID,
        status: 'submitted',
        reviewer_id: null,
        hearing_date: null,
        hearing_attendees: null,
        student_id: STUDENT_ID,
      };
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(appeal);

      const result = await service.update(TENANT_ID, APPEAL_ID, {}, USER_ID);

      expect(result).toEqual(appeal);
      expect(mockRlsTx.behaviourAppeal!.update).not.toHaveBeenCalled();
    });

    it('should transition to under_review when reviewer assigned from submitted', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        status: 'submitted',
        reviewer_id: null,
        student_id: STUDENT_ID,
      });
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'under_review',
      });

      await service.update(TENANT_ID, APPEAL_ID, { reviewer_id: 'rev-1' }, USER_ID);

      expect(mockRlsTx.behaviourAppeal!.update).toHaveBeenCalledWith({
        where: { id: APPEAL_ID },
        data: expect.objectContaining({
          status: 'under_review',
        }),
      });
    });

    it('should transition to hearing_scheduled when hearing_date set from under_review', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        status: 'under_review',
        reviewer_id: 'rev-1',
        hearing_date: null,
        student_id: STUDENT_ID,
      });
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'hearing_scheduled',
      });

      await service.update(TENANT_ID, APPEAL_ID, { hearing_date: '2026-04-15' }, USER_ID);

      expect(mockRlsTx.behaviourAppeal!.update).toHaveBeenCalledWith({
        where: { id: APPEAL_ID },
        data: expect.objectContaining({
          status: 'hearing_scheduled',
        }),
      });
    });
  });

  // ─── withdraw — branch coverage ──────────────────────────────────────────

  describe('withdraw — branch coverage', () => {
    it('should throw NotFoundException when appeal not found', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue(null);

      await expect(
        service.withdraw(TENANT_ID, APPEAL_ID, USER_ID, { reason: 'test' }),
      ).rejects.toThrow('Appeal not found');
    });

    it('should transition sanction back to scheduled when withdrawing', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'submitted',
        sanction: { id: SANCTION_ID, status: 'appealed' },
      });
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'withdrawn_appeal',
      });
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});

      await service.withdraw(TENANT_ID, APPEAL_ID, USER_ID, { reason: 'Changed mind' });

      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: { status: 'scheduled' },
      });
    });

    it('should not revert sanction when not in appealed status', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'under_review',
        sanction: { id: SANCTION_ID, status: 'served' },
      });
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({});

      await service.withdraw(TENANT_ID, APPEAL_ID, USER_ID, { reason: 'Not needed' });

      expect(mockRlsTx.behaviourSanction!.update).not.toHaveBeenCalled();
    });
  });

  // ─── decide — overturned with exclusion cases ────────────────────────────

  describe('decide — overturned with exclusion cases', () => {
    it('should overturn linked exclusion cases', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'under_review',
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        incident: { id: INCIDENT_ID, status: 'confirmed' },
        sanction: { id: SANCTION_ID, status: 'appealed' },
        exclusion_cases: [
          { id: 'exc-1', status: 'appeal_window' },
          { id: 'exc-2', status: 'appeal_window' },
        ],
      });
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({});
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'decided',
      });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'overturned',
        decision_reasoning: 'Not justified',
      });

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledTimes(2);
      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith({
        where: { id: 'exc-1' },
        data: { status: 'overturned' },
      });
      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith({
        where: { id: 'exc-2' },
        data: { status: 'overturned' },
      });
    });
  });

  // ─── decide — modified with incident amendments ──────────────────────────

  describe('decide — modified with incident amendments', () => {
    it('should apply incident-level amendments and create amendment notices', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'under_review',
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
        sanction_id: null,
        incident: {
          id: INCIDENT_ID,
          status: 'confirmed',
          category_id: 'cat-old',
        },
        sanction: null,
        exclusion_cases: [],
      });
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'decided',
      });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'modified',
        decision_reasoning: 'Category was wrong',
        amendments: [
          {
            entity_type: 'incident',
            entity_id: INCIDENT_ID,
            field: 'category_id',
            new_value: 'cat-new',
          },
        ],
      });

      expect(mockRlsTx.behaviourIncident!.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { category_id: 'cat-new' },
      });
      expect(mockAmendmentsService.createAmendmentNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'incident',
          entityId: INCIDENT_ID,
        }),
      );
    });
  });

  // ─── decide — with hearing_notes and hearing_attendees ────────────────────

  describe('decide — with hearing metadata', () => {
    it('should include hearing_notes and hearing_attendees in appeal update', async () => {
      mockRlsTx.behaviourAppeal!.findFirst.mockResolvedValue({
        id: APPEAL_ID,
        tenant_id: TENANT_ID,
        appeal_number: 'AP-202603-000001',
        status: 'hearing_scheduled',
        student_id: STUDENT_ID,
        incident_id: INCIDENT_ID,
        sanction_id: SANCTION_ID,
        incident: { id: INCIDENT_ID, status: 'confirmed' },
        sanction: { id: SANCTION_ID, status: 'appealed' },
        exclusion_cases: [],
      });
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourAppeal!.update.mockResolvedValue({
        id: APPEAL_ID,
        status: 'decided',
      });

      await service.decide(TENANT_ID, APPEAL_ID, USER_ID, {
        decision: 'upheld_original',
        decision_reasoning: 'Upheld',
        hearing_notes: 'Meeting held at 3pm',
        hearing_attendees: [{ name: 'Mr Smith', role: 'chair' }],
      });

      expect(mockRlsTx.behaviourAppeal!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hearing_notes: 'Meeting held at 3pm',
            hearing_attendees: [{ name: 'Mr Smith', role: 'chair' }],
          }),
        }),
      );
    });
  });

  // ─── getById — branch coverage ────────────────────────────────────────────

  describe('getById', () => {
    it('should throw NotFoundException when appeal not found', async () => {
      const mockPrismaService = (service as unknown as { prisma: Record<string, unknown> }).prisma;
      (mockPrismaService as Record<string, unknown>).behaviourAppeal = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(service.getById(TENANT_ID, 'bad-id')).rejects.toThrow('Appeal not found');
    });
  });

  // ─── list — filter branches ───────────────────────────────────────────────

  describe('list — filter branches', () => {
    let mockPrismaService: Record<string, unknown>;

    beforeEach(() => {
      mockPrismaService = (service as unknown as { prisma: Record<string, unknown> }).prisma;
      (mockPrismaService as Record<string, unknown>).behaviourAppeal = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };
    });

    it('should filter by status (maps withdrawn to withdrawn_appeal)', async () => {
      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'withdrawn' });

      const findManyMock = (mockPrismaService.behaviourAppeal as { findMany: jest.Mock }).findMany;
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'withdrawn_appeal',
          }),
        }),
      );
    });

    it('should filter by grounds_category (maps other to other_grounds)', async () => {
      await service.list(TENANT_ID, { page: 1, pageSize: 20, grounds_category: 'other' });

      const findManyMock = (mockPrismaService.behaviourAppeal as { findMany: jest.Mock }).findMany;
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            grounds_category: 'other_grounds',
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-01-01',
        date_to: '2026-06-30',
      });

      const findManyMock = (mockPrismaService.behaviourAppeal as { findMany: jest.Mock }).findMany;
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            submitted_at: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-06-30'),
            },
          }),
        }),
      );
    });

    it('should filter by student_id, entity_type, and reviewer_id', async () => {
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
        entity_type: 'sanction',
        reviewer_id: 'rev-1',
      });

      const findManyMock = (mockPrismaService.behaviourAppeal as { findMany: jest.Mock }).findMany;
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            entity_type: 'sanction',
            reviewer_id: 'rev-1',
          }),
        }),
      );
    });
  });

  // ─── stub methods ────────────────────────────────────────────────────────

  describe('stub methods', () => {
    it('uploadAttachment should return not_implemented', async () => {
      const result = await service.uploadAttachment(TENANT_ID, APPEAL_ID, {});
      expect(result.status).toBe('not_implemented');
    });

    it('getAttachments should return empty array', async () => {
      const result = await service.getAttachments(TENANT_ID, APPEAL_ID);
      expect(result).toEqual([]);
    });

    it('generateDecisionLetter should return not_implemented', async () => {
      const result = await service.generateDecisionLetter(TENANT_ID, APPEAL_ID);
      expect(result.status).toBe('not_implemented');
    });

    it('getEvidenceBundle should return not_implemented', async () => {
      const result = await service.getEvidenceBundle(TENANT_ID, APPEAL_ID);
      expect(result.status).toBe('not_implemented');
    });
  });
});
