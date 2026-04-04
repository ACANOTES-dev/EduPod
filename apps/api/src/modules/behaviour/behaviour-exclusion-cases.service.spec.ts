import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourExclusionCasesService } from './behaviour-exclusion-cases.service';
import { BehaviourHistoryService } from './behaviour-history.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SANCTION_ID = 'sanction-1';
const INCIDENT_ID = 'incident-1';
const STUDENT_ID = 'student-1';
const CASE_ID = 'case-1';
const USER_ID = 'user-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx = {
  behaviourExclusionCase: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  behaviourIncident: {
    update: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
  schoolClosure: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

const makeSanction = (overrides: Record<string, unknown> = {}) => ({
  id: SANCTION_ID,
  tenant_id: TENANT_ID,
  incident_id: INCIDENT_ID,
  student_id: STUDENT_ID,
  type: 'suspension_external',
  status: 'scheduled',
  suspension_days: 5,
  incident: { id: INCIDENT_ID },
  ...overrides,
});

const makeExclusionCase = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_ID,
  tenant_id: TENANT_ID,
  case_number: 'EX-202603-000001',
  sanction_id: SANCTION_ID,
  incident_id: INCIDENT_ID,
  student_id: STUDENT_ID,
  type: 'suspension_extended',
  status: 'initiated',
  statutory_timeline: [],
  appeal_deadline: null,
  decision: null,
  decision_date: null,
  decision_reasoning: null,
  decided_by_id: null,
  ...overrides,
});

describe('BehaviourExclusionCasesService', () => {
  let service: BehaviourExclusionCasesService;
  let mockPrisma: {
    behaviourExclusionCase: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
    behaviourDocument: { findMany: jest.Mock };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };
  let mockBehaviourQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourExclusionCase: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('EX-202603-000001'),
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };
    mockBehaviourQueue = { add: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourExclusionCasesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<BehaviourExclusionCasesService>(BehaviourExclusionCasesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createFromSanction ─────────────────────────────────────────────────

  describe('createFromSanction', () => {
    const setupCreateMocks = () => {
      // No existing exclusion case (idempotency check)
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      // Sanction exists
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(makeSanction());
      // No school closures
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      // Mocks for create and related updates
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(makeExclusionCase());
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});
    };

    it('should generate EX- sequence number on creation', async () => {
      setupCreateMocks();

      await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      expect(mockSequence.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'behaviour_exclusion',
        mockRlsTx,
        'EX',
      );

      expect(mockRlsTx.behaviourExclusionCase!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          case_number: 'EX-202603-000001',
        }),
      });
    });

    it('should populate statutory_timeline with correctly calculated dates', async () => {
      setupCreateMocks();

      await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      const createCall = mockRlsTx.behaviourExclusionCase!.create.mock.calls[0]![0] as {
        data: {
          statutory_timeline: Array<{
            step: string;
            required_by: string | null;
            completed_at: string | null;
            status: string;
          }>;
        };
      };
      const timeline = createCall.data.statutory_timeline;

      // buildStatutoryTimeline produces 6 entries
      expect(timeline).toHaveLength(6);

      // Verify the step names are correct
      expect(timeline[0]!.step).toBe('Written notice to parents');
      expect(timeline[1]!.step).toContain('Hearing scheduled');
      expect(timeline[2]!.step).toContain('Board pack');
      expect(timeline[3]!.step).toBe('Hearing held');
      expect(timeline[4]!.step).toContain('Decision communicated');
      expect(timeline[5]!.step).toContain('Appeal window');

      // Notice deadline should be set (3 school days from now)
      expect(timeline[0]!.required_by).toBeDefined();
      expect(timeline[0]!.required_by).not.toBeNull();

      // All completed_at should be null initially
      for (const step of timeline) {
        expect(step.completed_at).toBeNull();
      }
    });

    it('should set legal hold on incident, sanction, and all linked entities', async () => {
      setupCreateMocks();

      await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      // Legal hold set on incident
      expect(mockRlsTx.behaviourIncident!.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { retention_status: 'legal_hold' },
      });

      // Legal hold set on sanction
      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: { retention_status: 'legal_hold' },
      });
    });

    it('should not create duplicate exclusion case if one already exists for sanction', async () => {
      // Existing case found — idempotency guard
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(makeExclusionCase());

      const result = await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      // Should return the existing case
      expect(result).toEqual(makeExclusionCase());
      // Should NOT call create
      expect(mockRlsTx.behaviourExclusionCase!.create).not.toHaveBeenCalled();
    });
  });

  // ─── getTimeline ────────────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('should mark timeline step overdue when required_by is past and completed_at is null', async () => {
      const pastDate = '2026-03-01';
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue({
        statutory_timeline: [
          {
            step: 'Written notice to parents',
            required_by: pastDate,
            completed_at: null,
            status: 'pending',
          },
          {
            step: 'Hearing held',
            required_by: null,
            completed_at: null,
            status: 'not_started',
          },
        ],
      });

      const result = await service.getTimeline(TENANT_ID, CASE_ID);

      // The first step should be overdue (past date, not completed)
      expect(result.data[0]!.status).toBe('overdue');
      // The second step has no required_by, should be not_started
      expect(result.data[1]!.status).toBe('not_started');
    });
  });

  // ─── transitionStatus ───────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should transition status through notice_issued -> hearing_scheduled -> hearing_held -> decision_made -> appeal_window', async () => {
      const transitions: Array<{
        from: string;
        to: string;
      }> = [
        { from: 'initiated', to: 'notice_issued' },
        { from: 'notice_issued', to: 'hearing_scheduled_exc' },
        { from: 'hearing_scheduled_exc', to: 'hearing_held' },
        { from: 'hearing_held', to: 'decision_made' },
        { from: 'decision_made', to: 'appeal_window' },
      ];

      for (const t of transitions) {
        // Reset mocks for each iteration
        mockRlsTx.behaviourExclusionCase!.findFirst.mockReset();
        mockRlsTx.behaviourExclusionCase!.findUnique.mockReset();
        mockRlsTx.behaviourExclusionCase!.update.mockReset();
        mockHistory.recordHistory.mockReset();

        mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
          makeExclusionCase({ status: t.from, statutory_timeline: [] }),
        );
        mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
          makeExclusionCase({ status: t.from, statutory_timeline: [] }),
        );
        mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
          makeExclusionCase({ status: t.to }),
        );

        await service.transitionStatus(
          TENANT_ID,
          CASE_ID,
          t.to as Parameters<typeof service.transitionStatus>[2],
          undefined,
          USER_ID,
        );

        expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CASE_ID },
            data: expect.objectContaining({
              status: t.to,
            }),
          }),
        );
      }
    });

    it('should throw BadRequestException for invalid exclusion case transition', async () => {
      // Try initiated -> hearing_held (skipping notice_issued)
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'initiated' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, CASE_ID, 'hearing_held', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── recordDecision ─────────────────────────────────────────────────────

  describe('recordDecision', () => {
    it('should calculate appeal_deadline as 15 school days from decision_date', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'hearing_held' }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
        makeExclusionCase({
          status: 'hearing_held',
          statutory_timeline: [
            {
              step: 'Decision communicated to parents in writing',
              required_by: null,
              completed_at: null,
              status: 'not_started',
            },
            {
              step: 'Appeal window (15 school days from decision date)',
              required_by: null,
              completed_at: null,
              status: 'not_started',
            },
          ],
        }),
      );
      // No school closures
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'appeal_window' }),
      );

      const dto = {
        decision: 'exclusion_confirmed' as const,
        decision_reasoning: 'The evidence supports the exclusion.',
        decided_by_id: USER_ID,
      };

      await service.recordDecision(TENANT_ID, CASE_ID, dto, USER_ID);

      // Verify the update was called with an appeal_deadline
      const updateCall = mockRlsTx.behaviourExclusionCase!.update.mock.calls[0]![0] as {
        data: { appeal_deadline: Date; status: string };
      };

      expect(updateCall.data.appeal_deadline).toBeInstanceOf(Date);
      expect(updateCall.data.status).toBe('appeal_window');

      // The appeal deadline should be approximately 15 school days (3 calendar weeks)
      // from now. With no closures and standard weekends, 15 school days = 21 calendar days.
      const now = new Date();
      const deadline = updateCall.data.appeal_deadline;
      const diffMs = deadline.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // 15 school days is 21 calendar days (3 weeks). Allow small tolerance for test timing.
      expect(diffDays).toBeGreaterThanOrEqual(20);
      expect(diffDays).toBeLessThanOrEqual(22);
    });
  });

  // ─── blocked transitions ──────────────────────────────────────────────

  describe('blocked transitions', () => {
    it('should reject finalised -> any (terminal status)', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'finalised' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, CASE_ID, 'notice_issued', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject overturned -> any (terminal status)', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'overturned' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, CASE_ID, 'notice_issued', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject initiated -> hearing_scheduled_exc (must go through notice_issued)', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'initiated' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, CASE_ID, 'hearing_scheduled_exc', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
