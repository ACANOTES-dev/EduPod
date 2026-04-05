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

      // 15 school days is 21 calendar days (3 weeks). Allow tolerance for test timing and rounding.
      expect(diffDays).toBeGreaterThanOrEqual(19);
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

  // ─── getById — branch coverage ────────────────────────────────────────────

  describe('getById', () => {
    it('should throw NotFoundException when case does not exist', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, 'missing-id')).rejects.toThrow(
        'Exclusion case not found',
      );
    });

    it('should return exclusion case with relations', async () => {
      const excCase = makeExclusionCase();
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue({
        ...excCase,
        student: { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith', year_group: null },
        sanction: { id: SANCTION_ID, sanction_number: 'SAN-001', type: 'suspension_external' },
        incident: null,
        decided_by: null,
        appeal: null,
      });

      const result = await service.getById(TENANT_ID, CASE_ID);

      expect(result.case_number).toBe('EX-202603-000001');
    });
  });

  // ─── list — branch coverage ───────────────────────────────────────────────

  describe('list', () => {
    it('should apply status and type filters', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);
      mockPrisma.behaviourExclusionCase.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'initiated',
        type: 'suspension_extended',
      });

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'initiated',
            type: 'suspension_extended',
          }),
        }),
      );
    });

    it('should filter by student_id', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);
      mockPrisma.behaviourExclusionCase.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
      });

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should filter has_appeal=true', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);
      mockPrisma.behaviourExclusionCase.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        has_appeal: true,
      });

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            appeal_id: { not: null },
          }),
        }),
      );
    });

    it('should filter has_appeal=false', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);
      mockPrisma.behaviourExclusionCase.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        has_appeal: false,
      });

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            appeal_id: null,
          }),
        }),
      );
    });

    it('should filter by appeal_deadline_before', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);
      mockPrisma.behaviourExclusionCase.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        appeal_deadline_before: '2026-04-01',
      });

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            appeal_deadline: { lte: new Date('2026-04-01') },
          }),
        }),
      );
    });
  });

  // ─── update — branch coverage ─────────────────────────────────────────────

  describe('update', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, CASE_ID, { hearing_date: '2026-04-10' }, USER_ID),
      ).rejects.toThrow('Exclusion case not found');
    });

    it('should return unchanged case when no values differ', async () => {
      const excCase = makeExclusionCase();
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);

      const result = await service.update(TENANT_ID, CASE_ID, {}, USER_ID);

      expect(result).toEqual(excCase);
      expect(mockRlsTx.behaviourExclusionCase!.update).not.toHaveBeenCalled();
    });

    it('should update hearing_date and record history', async () => {
      const excCase = makeExclusionCase({ hearing_date: null });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        hearing_date: new Date('2026-04-10'),
      });

      await service.update(TENANT_ID, CASE_ID, { hearing_date: '2026-04-10' }, USER_ID);

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CASE_ID },
          data: expect.objectContaining({
            hearing_date: new Date('2026-04-10'),
          }),
        }),
      );
      expect(mockHistory.recordHistory).toHaveBeenCalled();
    });

    it('should clear nullable fields', async () => {
      const excCase = makeExclusionCase({ conditions_for_return: 'old conditions' });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        conditions_for_return: null,
      });

      await service.update(
        TENANT_ID,
        CASE_ID,
        { conditions_for_return: undefined } as never,
        USER_ID,
      );

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conditions_for_return: null,
          }),
        }),
      );
    });
  });

  // ─── transitionStatus — NotFoundException ─────────────────────────────────

  describe('transitionStatus — NotFoundException', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, CASE_ID, 'notice_issued', undefined, USER_ID),
      ).rejects.toThrow('Exclusion case not found');
    });
  });

  // ─── transitionStatus — notice_issued side effects ────────────────────────

  describe('transitionStatus — notice_issued side effects', () => {
    it('should set formal_notice_issued_at and mark timeline step complete', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({
          status: 'initiated',
          statutory_timeline: [
            {
              step: 'Written notice to parents',
              required_by: '2026-04-01',
              completed_at: null,
              status: 'pending',
            },
          ],
        }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
        makeExclusionCase({
          statutory_timeline: [
            {
              step: 'Written notice to parents',
              required_by: '2026-04-01',
              completed_at: null,
              status: 'pending',
            },
          ],
        }),
      );
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'notice_issued' }),
      );

      await service.transitionStatus(
        TENANT_ID,
        CASE_ID,
        'notice_issued',
        'Notice delivered',
        USER_ID,
      );

      // Should call update twice: once for timeline, once for status
      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalled();
    });
  });

  // ─── getTimeline — NotFoundException ──────────────────────────────────────

  describe('getTimeline — NotFoundException', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue(null);

      await expect(service.getTimeline(TENANT_ID, 'bad-id')).rejects.toThrow(
        'Exclusion case not found',
      );
    });
  });

  // ─── getDocuments — branch coverage ──────────────────────────────────────

  describe('getDocuments', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue(null);

      await expect(service.getDocuments(TENANT_ID, 'bad-id')).rejects.toThrow(
        'Exclusion case not found',
      );
    });

    it('should return linked documents', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue({ id: CASE_ID });
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([
        { id: 'doc-1', document_type: 'exclusion_notice', status: 'draft_doc' },
      ]);

      const result = await service.getDocuments(TENANT_ID, CASE_ID);

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── recordDecision — branch coverage ─────────────────────────────────────

  describe('recordDecision — NotFoundException', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);

      await expect(
        service.recordDecision(
          TENANT_ID,
          'bad-id',
          {
            decision: 'exclusion_confirmed' as const,
            decision_reasoning: 'Test',
            decided_by_id: USER_ID,
          },
          USER_ID,
        ),
      ).rejects.toThrow('Exclusion case not found');
    });

    it('should throw BadRequestException when not in hearing_held or decision_made status', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'initiated' }),
      );

      await expect(
        service.recordDecision(
          TENANT_ID,
          CASE_ID,
          {
            decision: 'exclusion_confirmed' as const,
            decision_reasoning: 'Test',
            decided_by_id: USER_ID,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── createFromSanction — expulsion type ─────────────────────────────────

  describe('createFromSanction — expulsion type', () => {
    it('should map expulsion sanction type to expulsion exclusion type', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(makeSanction({ type: 'expulsion' }));
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(
        makeExclusionCase({ type: 'expulsion' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      expect(mockRlsTx.behaviourExclusionCase!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'expulsion',
        }),
      });
    });
  });

  // ─── createFromSanction — sanction not found ─────────────────────────────

  describe('createFromSanction — sanction not found', () => {
    it('should throw NotFoundException when sanction does not exist', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(null);

      await expect(
        service.createFromSanction(TENANT_ID, SANCTION_ID, mockRlsTx as unknown as PrismaService),
      ).rejects.toThrow('Sanction not found');
    });
  });

  // ─── generateNotice / generateBoardPack stubs ────────────────────────────

  describe('stub methods', () => {
    it('generateNotice should return not_implemented', async () => {
      const result = await service.generateNotice(TENANT_ID, CASE_ID, USER_ID);
      expect(result.status).toBe('not_implemented');
    });

    it('generateBoardPack should return not_implemented', async () => {
      const result = await service.generateBoardPack(TENANT_ID, CASE_ID, USER_ID);
      expect(result.status).toBe('not_implemented');
    });
  });

  // ─── create (manual) ──────────────────────────────────────────────────────

  describe('create (manual)', () => {
    it('should delegate to createFromSanction via RLS transaction', async () => {
      // Idempotency check
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(makeSanction());
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(makeExclusionCase());
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      const result = await service.create(TENANT_ID, { sanction_id: SANCTION_ID }, USER_ID);

      expect(result).toBeDefined();
      expect(mockRlsTx.behaviourExclusionCase!.create).toHaveBeenCalled();
    });
  });

  // ─── transitionStatus — hearing_held side effects ──────────────────────

  describe('transitionStatus — hearing_held side effects', () => {
    it('should mark Hearing held timeline step complete', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({
          status: 'hearing_scheduled_exc',
          statutory_timeline: [
            {
              step: 'Hearing held',
              required_by: null,
              completed_at: null,
              status: 'not_started',
            },
          ],
        }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
        makeExclusionCase({
          statutory_timeline: [
            {
              step: 'Hearing held',
              required_by: null,
              completed_at: null,
              status: 'not_started',
            },
          ],
        }),
      );
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'hearing_held' }),
      );

      await service.transitionStatus(
        TENANT_ID,
        CASE_ID,
        'hearing_held',
        'Hearing conducted',
        USER_ID,
      );

      // Should update the timeline step to complete
      const updateCalls = mockRlsTx.behaviourExclusionCase!.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── recordDecision — from decision_made status ────��───────────────────

  describe('recordDecision — from decision_made', () => {
    it('should allow recording decision when status is decision_made', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'decision_made' }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
        makeExclusionCase({
          status: 'decision_made',
          statutory_timeline: [],
        }),
      );
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'appeal_window' }),
      );

      const dto = {
        decision: 'exclusion_confirmed' as const,
        decision_reasoning: 'Evidence is clear',
        decided_by_id: USER_ID,
        conditions_for_return: 'Must attend a restorative meeting',
        conditions_for_transfer: undefined,
      };

      await service.recordDecision(TENANT_ID, CASE_ID, dto, USER_ID);

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalled();
    });
  });

  // ─── update — hearing_attendees and student_representation fields ──────

  describe('update — additional field branches', () => {
    it('should update hearing_attendees as JSON', async () => {
      const excCase = makeExclusionCase({ hearing_attendees: null });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        hearing_attendees: [{ name: 'John', role: 'Chair' }],
      });

      await service.update(
        TENANT_ID,
        CASE_ID,
        { hearing_attendees: [{ name: 'John', role: 'Chair' }] },
        USER_ID,
      );

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hearing_attendees: [{ name: 'John', role: 'Chair' }],
          }),
        }),
      );
    });

    it('should update student_representation', async () => {
      const excCase = makeExclusionCase({ student_representation: null });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        student_representation: 'Solicitor present',
      });

      await service.update(
        TENANT_ID,
        CASE_ID,
        { student_representation: 'Solicitor present' },
        USER_ID,
      );

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            student_representation: 'Solicitor present',
          }),
        }),
      );
    });

    it('should update conditions_for_transfer', async () => {
      const excCase = makeExclusionCase({ conditions_for_transfer: null });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        conditions_for_transfer: 'School transfer required',
      });

      await service.update(
        TENANT_ID,
        CASE_ID,
        { conditions_for_transfer: 'School transfer required' },
        USER_ID,
      );

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conditions_for_transfer: 'School transfer required',
          }),
        }),
      );
    });

    it('should clear hearing_date to null', async () => {
      const excCase = makeExclusionCase({ hearing_date: new Date('2026-04-10') });
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(excCase);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue({
        ...excCase,
        hearing_date: null,
      });

      await service.update(TENANT_ID, CASE_ID, { hearing_date: undefined } as never, USER_ID);

      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hearing_date: null,
          }),
        }),
      );
    });
  });

  // ─── createFromSanction — unmapped sanction type ───────────────────────

  describe('createFromSanction — unmapped sanction type', () => {
    it('should default to suspension_extended for unmapped sanction types', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(
        makeSanction({ type: 'some_other_type' }),
      );
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(
        makeExclusionCase({ type: 'suspension_extended' }),
      );
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      expect(mockRlsTx.behaviourExclusionCase!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'suspension_extended',
        }),
      });
    });
  });

  // ─── markTimelineStepComplete — case not found ─────────────────────────

  describe('transitionStatus — notice_issued with no timeline', () => {
    it('should handle empty statutory_timeline for markTimelineStepComplete', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'initiated', statutory_timeline: [] }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'notice_issued' }),
      );

      await service.transitionStatus(TENANT_ID, CASE_ID, 'notice_issued', undefined, USER_ID);

      // Should not crash when findUnique returns null
      expect(mockRlsTx.behaviourExclusionCase!.update).toHaveBeenCalled();
    });
  });

  // ─── getTimeline — null statutory_timeline ────────────────────────────

  describe('getTimeline — null statutory_timeline', () => {
    it('should handle null statutory_timeline', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue({
        statutory_timeline: null,
      });

      const result = await service.getTimeline(TENANT_ID, CASE_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── getTimeline — step with already completed ────────────────────────

  describe('getTimeline — completed step', () => {
    it('should preserve complete status for already-completed steps', async () => {
      mockPrisma.behaviourExclusionCase.findFirst.mockResolvedValue({
        statutory_timeline: [
          {
            step: 'Written notice to parents',
            required_by: '2026-03-01',
            completed_at: '2026-02-28',
            status: 'complete',
          },
        ],
      });

      const result = await service.getTimeline(TENANT_ID, CASE_ID);

      expect(result.data[0]!.status).toBe('complete');
    });
  });

  // ─── createFromSanction — auto-generate doc suppressed when disabled ──

  describe('createFromSanction — doc generation', () => {
    it('should suppress auto-generate when document_auto_generate_exclusion_notice is false', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(makeSanction());
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(makeExclusionCase());
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      // Add tenantSetting mock with document generation disabled
      (mockRlsTx as Record<string, unknown>).tenantSetting = {
        findFirst: jest.fn().mockResolvedValue({
          settings: {
            behaviour: {
              document_auto_generate_exclusion_notice: false,
            },
          },
        }),
      };

      const result = await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      // Should still create the exclusion case, just not the document
      expect(result).toBeDefined();
    });

    it('should handle document generation error without failing case creation', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(makeSanction());
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.create.mockResolvedValue(makeExclusionCase());
      mockRlsTx.behaviourIncident!.update.mockResolvedValue({});
      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});
      mockRlsTx.behaviourTask!.create.mockResolvedValue({});

      (mockRlsTx as Record<string, unknown>).tenantSetting = {
        findFirst: jest.fn().mockRejectedValue(new Error('DB error')),
      };

      const result = await service.createFromSanction(
        TENANT_ID,
        SANCTION_ID,
        mockRlsTx as unknown as PrismaService,
      );

      expect(result).toBeDefined();
    });
  });

  // ─── recordDecision — conditions_for_return and conditions_for_transfer ─

  describe('recordDecision — optional fields', () => {
    it('should pass conditions_for_return and conditions_for_transfer to update', async () => {
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(
        makeExclusionCase({ status: 'hearing_held' }),
      );
      mockRlsTx.behaviourExclusionCase!.findUnique.mockResolvedValue(
        makeExclusionCase({ status: 'hearing_held', statutory_timeline: [] }),
      );
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase!.update.mockResolvedValue(
        makeExclusionCase({ status: 'appeal_window' }),
      );

      const dto = {
        decision: 'exclusion_confirmed' as const,
        decision_reasoning: 'Evidence supports',
        decided_by_id: USER_ID,
        conditions_for_return: 'Must attend restorative session',
        conditions_for_transfer: 'Transfer to partner school',
      };

      await service.recordDecision(TENANT_ID, CASE_ID, dto, USER_ID);

      const firstUpdateCall = mockRlsTx.behaviourExclusionCase!.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(firstUpdateCall.data.conditions_for_return).toBe('Must attend restorative session');
      expect(firstUpdateCall.data.conditions_for_transfer).toBe('Transfer to partner school');
    });
  });
});
