import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, AuthReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../sequence/sequence.service';

import { CaseQueriesService } from './case-queries.service';
import { CaseService } from './case.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID_B = '11111111-1111-1111-1111-111111111111';
const CONCERN_ID_A = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CONCERN_ID_B = '22222222-2222-2222-2222-222222222222';
const CASE_ID = '33333333-3333-3333-3333-333333333333';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralCase: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralCaseStudent: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  membership: {
    findFirst: jest.fn(),
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

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_ID,
  tenant_id: TENANT_ID,
  case_number: 'PC-202603-000001',
  status: 'open',
  student_id: STUDENT_ID,
  owner_user_id: USER_ID_A,
  opened_reason: 'Multiple concerns raised about student welfare.',
  tier: 1,
  next_review_date: null,
  resolved_at: null,
  closed_at: null,
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID_A,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  case_id: null,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  logged_by_user_id: USER_ID_A,
  author_masked: false,
  occurred_at: new Date('2026-03-01T10:00:00Z'),
  created_at: new Date('2026-03-01T10:00:00Z'),
  updated_at: new Date('2026-03-01T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CaseService', () => {
  let service: CaseService;
  let queriesService: CaseQueriesService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockSequenceService: { nextNumber: jest.Mock };
  let mockPrisma: {
    cpAccessGrant: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockSequenceService = {
      nextNumber: jest.fn().mockResolvedValue('PC-202603-000001'),
    };

    mockPrisma = {
      cpAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: USER_ID_B }),
        findUnique: jest.fn().mockResolvedValue({ id: USER_ID_B }),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model) as jest.Mock[]) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        CaseService,
        CaseQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        {
          provide: AuthReadFacade,
          useValue: { findUserSummary: jest.fn().mockResolvedValue({ id: USER_ID_B }) },
        },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
    queriesService = module.get<CaseQueriesService>(CaseQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      concern_ids: [CONCERN_ID_A],
      owner_user_id: USER_ID_A,
      opened_reason: 'Multiple concerns raised about student welfare.',
      tier: 1 as const,
    };

    const setupCreateMocks = (concernOverrides: Record<string, unknown>[] = [{}]) => {
      const concerns = concernOverrides.map((o, i) =>
        makeConcern({
          id: i === 0 ? CONCERN_ID_A : `concern-${i}`,
          ...o,
        }),
      );
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);

      const createdCase = makeCase();
      mockRlsTx.pastoralCase.create.mockResolvedValue(createdCase);
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(createdCase);
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });

      return { concerns, createdCase };
    };

    it('should create case with valid concerns and generate case number', async () => {
      setupCreateMocks();

      const result = await service.create(TENANT_ID, USER_ID_A, baseDto);

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'pastoral_case',
        expect.anything(),
        'PC',
      );
      expect(mockRlsTx.pastoralCase.create).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          case_number: 'PC-202603-000001',
          status: 'open',
          student_id: STUDENT_ID,
          owner_user_id: USER_ID_A,
        }),
      });
      expect(result).toBeDefined();
    });

    it('should reject case creation with empty concern_ids', async () => {
      await expect(
        service.create(TENANT_ID, USER_ID_A, {
          ...baseDto,
          concern_ids: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject case creation with concerns from different tenants', async () => {
      // Return empty array (no valid concerns found in tenant)
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);

      await expect(service.create(TENANT_ID, USER_ID_A, baseDto)).rejects.toThrow();
    });

    it('should set initial status to open', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID_A, baseDto);

      expect(mockRlsTx.pastoralCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'open',
        }),
      });
    });

    it('should calculate tier as max of linked concerns', async () => {
      // Two concerns: tier 1 and tier 3
      setupCreateMocks([
        { id: CONCERN_ID_A, tier: 1 },
        { id: CONCERN_ID_B, tier: 3 },
      ]);

      await service.create(TENANT_ID, USER_ID_A, {
        ...baseDto,
        concern_ids: [CONCERN_ID_A, CONCERN_ID_B],
      });

      expect(mockRlsTx.pastoralCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tier: 3,
        }),
      });
    });

    it('should record case_created audit event', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID_A, baseDto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'case_created',
          entity_type: 'case',
          actor_user_id: USER_ID_A,
          payload: expect.objectContaining({
            case_number: 'PC-202603-000001',
            linked_concern_ids: expect.any(Array),
            owner_user_id: USER_ID_A,
          }),
        }),
      );
    });

    it('should create pastoral_case_students row for primary student', async () => {
      setupCreateMocks();

      await service.create(TENANT_ID, USER_ID_A, baseDto);

      expect(mockRlsTx.pastoralCaseStudent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          student_id: STUDENT_ID,
        }),
      });
    });
  });

  // ─── state machine transitions ────────────────────────────────────────────

  describe('transition', () => {
    const transitionDto = (status: 'open' | 'active' | 'monitoring' | 'resolved' | 'closed') => ({
      status,
      reason: 'Status change rationale.',
    });

    const setupTransitionMock = (currentStatus: string) => {
      const existingCase = makeCase({ status: currentStatus });
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(existingCase);
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(existingCase);
    };

    // ─── valid transitions ───────────────────────────────────────────────

    it('should allow open -> active', async () => {
      setupTransitionMock('open');
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'active' }));

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('active'),
      );

      expect(result.data.status).toBe('active');
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_status_changed',
          payload: expect.objectContaining({
            old_status: 'open',
            new_status: 'active',
          }),
        }),
      );
    });

    it('should allow active -> monitoring', async () => {
      setupTransitionMock('active');
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'monitoring' }));

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('monitoring'),
      );

      expect(result.data.status).toBe('monitoring');
    });

    it('should allow active -> resolved and set resolved_at', async () => {
      setupTransitionMock('active');
      const resolvedCase = makeCase({
        status: 'resolved',
        resolved_at: new Date(),
      });
      mockRlsTx.pastoralCase.update.mockResolvedValue(resolvedCase);

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('resolved'),
      );

      expect(result.data.status).toBe('resolved');
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'resolved',
            resolved_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should allow monitoring -> active (re-escalation)', async () => {
      setupTransitionMock('monitoring');
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'active' }));

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('active'),
      );

      expect(result.data.status).toBe('active');
    });

    it('should allow monitoring -> resolved and set resolved_at', async () => {
      setupTransitionMock('monitoring');
      mockRlsTx.pastoralCase.update.mockResolvedValue(
        makeCase({ status: 'resolved', resolved_at: new Date() }),
      );

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('resolved'),
      );

      expect(result.data.status).toBe('resolved');
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolved_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should allow resolved -> closed and set closed_at', async () => {
      setupTransitionMock('resolved');
      const closedCase = makeCase({
        status: 'closed',
        closed_at: new Date(),
      });
      mockRlsTx.pastoralCase.update.mockResolvedValue(closedCase);

      const result = await service.transition(
        TENANT_ID,
        USER_ID_A,
        CASE_ID,
        transitionDto('closed'),
      );

      expect(result.data.status).toBe('closed');
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'closed',
            closed_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should allow closed -> open (reopen) and clear timestamps', async () => {
      setupTransitionMock('closed');
      const reopenedCase = makeCase({
        status: 'open',
        resolved_at: null,
        closed_at: null,
      });
      mockRlsTx.pastoralCase.update.mockResolvedValue(reopenedCase);

      const result = await service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('open'));

      expect(result.data.status).toBe('open');
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'open',
            resolved_at: null,
            closed_at: null,
          }),
        }),
      );
    });

    // ─── blocked invalid transitions ─────────────────────────────────────

    it('should reject open -> resolved (invalid skip)', async () => {
      setupTransitionMock('open');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('resolved')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject open -> closed (invalid skip)', async () => {
      setupTransitionMock('open');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('closed')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject active -> open (invalid backward)', async () => {
      setupTransitionMock('active');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('open')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject monitoring -> closed (invalid skip)', async () => {
      setupTransitionMock('monitoring');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('closed')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject resolved -> active (invalid backward)', async () => {
      setupTransitionMock('resolved');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('active')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject closed -> active (must reopen first)', async () => {
      setupTransitionMock('closed');

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('active')),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include reason in audit event payload', async () => {
      setupTransitionMock('open');
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'active' }));

      await service.transition(TENANT_ID, USER_ID_A, CASE_ID, {
        status: 'active' as const,
        reason: 'Activating for follow-up.',
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            reason: 'Activating for follow-up.',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent case', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(null);

      await expect(
        service.transition(TENANT_ID, USER_ID_A, 'nonexistent-id', transitionDto('active')),
      ).rejects.toThrow();
    });

    it('should record case_status_changed audit event on every valid transition', async () => {
      setupTransitionMock('active');
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'monitoring' }));

      await service.transition(TENANT_ID, USER_ID_A, CASE_ID, transitionDto('monitoring'));

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'case_status_changed',
          entity_type: 'case',
          entity_id: CASE_ID,
          payload: expect.objectContaining({
            case_id: CASE_ID,
            old_status: 'active',
            new_status: 'monitoring',
            reason: 'Status change rationale.',
          }),
        }),
      );
    });
  });

  // ─── transferOwnership ────────────────────────────────────────────────────

  describe('transferOwnership', () => {
    it('should transfer ownership with audit event', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ owner_user_id: USER_ID_A }));
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ owner_user_id: USER_ID_A }));

      // Validate new owner exists and belongs to tenant
      mockRlsTx.user.findFirst.mockResolvedValue({ id: USER_ID_B });
      mockRlsTx.user.findUnique.mockResolvedValue({ id: USER_ID_B });
      mockRlsTx.membership.findFirst.mockResolvedValue({
        user_id: USER_ID_B,
        tenant_id: TENANT_ID,
      });

      const updatedCase = makeCase({ owner_user_id: USER_ID_B });
      mockRlsTx.pastoralCase.update.mockResolvedValue(updatedCase);

      const result = await service.transferOwnership(TENANT_ID, USER_ID_A, CASE_ID, {
        new_owner_user_id: USER_ID_B,
        reason: 'Staff rotation.',
      });

      expect(result.data.owner_user_id).toBe(USER_ID_B);
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_ownership_transferred',
          payload: expect.objectContaining({
            case_id: CASE_ID,
            old_owner_user_id: USER_ID_A,
            new_owner_user_id: USER_ID_B,
            reason: 'Staff rotation.',
          }),
        }),
      );
    });
  });

  // ─── linkConcern / unlinkConcern ──────────────────────────────────────────

  describe('linkConcern', () => {
    it('should link additional concern and recalculate tier', async () => {
      // Existing case with tier 1
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ tier: 1 }));
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ tier: 1 }));

      // Concern to link (tier 2, not linked to any case)
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, tier: 2, case_id: null }),
      );
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, tier: 2, case_id: null }),
      );

      // After linking, all concerns on the case
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ id: CONCERN_ID_A, tier: 1, case_id: CASE_ID }),
        makeConcern({ id: CONCERN_ID_B, tier: 2, case_id: CASE_ID }),
      ]);

      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, case_id: CASE_ID }),
      );
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ tier: 2 }));

      await service.linkConcern(TENANT_ID, USER_ID_A, CASE_ID, { concern_id: CONCERN_ID_B });

      // Verify concern's case_id was updated
      expect(mockRlsTx.pastoralConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            case_id: CASE_ID,
          }),
        }),
      );

      // Verify case tier was recalculated to 2
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 2,
          }),
        }),
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_concern_linked',
          entity_type: 'case',
          entity_id: CASE_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID_A,
          tier: 2,
          payload: {
            case_id: CASE_ID,
            concern_id: CONCERN_ID_B,
            student_id: STUDENT_ID,
          },
        }),
      );
    });
  });

  describe('unlinkConcern', () => {
    it('should reject unlinking last concern', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());

      // The concern to unlink
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(makeConcern({ case_id: CASE_ID }));
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(makeConcern({ case_id: CASE_ID }));

      // Only 1 concern on this case
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([makeConcern({ case_id: CASE_ID })]);

      await expect(
        service.unlinkConcern(TENANT_ID, USER_ID_A, CASE_ID, CONCERN_ID_A),
      ).rejects.toThrow(BadRequestException);
    });

    it('should recalculate tier when concern unlinked', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ tier: 3 }));
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ tier: 3 }));

      // The tier 3 concern being unlinked
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, tier: 3, case_id: CASE_ID }),
      );
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, tier: 3, case_id: CASE_ID }),
      );

      // 2 concerns currently linked (so unlinking is allowed)
      mockRlsTx.pastoralConcern.count.mockResolvedValue(2);

      // After unlink, only the tier 1 concern remains
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ id: CONCERN_ID_A, tier: 1, case_id: CASE_ID }),
      ]);

      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_B, case_id: null }),
      );
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ tier: 1 }));

      await service.unlinkConcern(TENANT_ID, USER_ID_A, CASE_ID, CONCERN_ID_B);

      // Verify tier was recalculated to 1
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 1,
          }),
        }),
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_concern_unlinked',
          entity_type: 'case',
          entity_id: CASE_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID_A,
          tier: 3,
          payload: {
            case_id: CASE_ID,
            concern_id: CONCERN_ID_B,
            student_id: STUDENT_ID,
          },
        }),
      );
    });
  });

  // ─── findOrphanedCases ────────────────────────────────────────────────────

  describe('findOrphans', () => {
    it('should detect case with zero linked concerns', async () => {
      const orphanCase = makeCase({ status: 'active' });
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([orphanCase]);

      const result = await queriesService.findOrphans(TENANT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(CASE_ID);
    });

    it('should not flag closed cases as orphans', async () => {
      // Only non-closed cases without concerns should be returned
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);

      const result = await queriesService.findOrphans(TENANT_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── multi-student support ────────────────────────────────────────────────

  describe('addStudent', () => {
    it('should add student to case', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.student.findFirst.mockResolvedValue({
        id: STUDENT_ID_B,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.student.findUnique.mockResolvedValue({
        id: STUDENT_ID_B,
        tenant_id: TENANT_ID,
      });

      // Not already linked
      mockRlsTx.pastoralCaseStudent.findUnique.mockResolvedValue(null);
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID_B,
      });

      await service.addStudent(TENANT_ID, USER_ID_A, CASE_ID, { student_id: STUDENT_ID_B });

      expect(mockRlsTx.pastoralCaseStudent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          case_id: CASE_ID,
          student_id: STUDENT_ID_B,
        }),
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_student_added',
          entity_type: 'case',
          entity_id: CASE_ID,
          student_id: STUDENT_ID_B,
          actor_user_id: USER_ID_A,
          tier: 1,
          payload: {
            case_id: CASE_ID,
            student_id: STUDENT_ID_B,
          },
        }),
      );
    });

    it('should be idempotent when adding already-linked student', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.student.findFirst.mockResolvedValue({
        id: STUDENT_ID_B,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.student.findUnique.mockResolvedValue({
        id: STUDENT_ID_B,
        tenant_id: TENANT_ID,
      });

      // Already linked
      mockRlsTx.pastoralCaseStudent.findUnique.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID_B,
      });

      // Should not throw
      await expect(
        service.addStudent(TENANT_ID, USER_ID_A, CASE_ID, { student_id: STUDENT_ID_B }),
      ).resolves.not.toThrow();

      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });
  });

  describe('removeStudent', () => {
    it('should reject removing primary student', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ student_id: STUDENT_ID }));
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ student_id: STUDENT_ID }));

      await expect(
        service.removeStudent(TENANT_ID, USER_ID_A, CASE_ID, STUDENT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove non-primary student', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ student_id: STUDENT_ID }));
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ student_id: STUDENT_ID }));

      mockRlsTx.pastoralCaseStudent.findFirst.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID_B,
      });
      mockRlsTx.pastoralCaseStudent.findUnique.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID_B,
      });
      mockRlsTx.pastoralCaseStudent.delete.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID_B,
      });
      mockRlsTx.pastoralCaseStudent.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeStudent(TENANT_ID, USER_ID_A, CASE_ID, STUDENT_ID_B);

      // Should have attempted to delete the student link
      const deleteCall =
        mockRlsTx.pastoralCaseStudent.delete.mock.calls[0] ??
        mockRlsTx.pastoralCaseStudent.deleteMany.mock.calls[0];
      expect(deleteCall).toBeDefined();

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'case_student_removed',
          entity_type: 'case',
          entity_id: CASE_ID,
          student_id: STUDENT_ID_B,
          actor_user_id: USER_ID_A,
          tier: 1,
          payload: {
            case_id: CASE_ID,
            student_id: STUDENT_ID_B,
          },
        }),
      );
    });
  });

  // ─── case number sequence ─────────────────────────────────────────────────

  describe('case number generation', () => {
    it('should generate PC-prefixed case numbers via SequenceService', async () => {
      const concerns = [makeConcern()];
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test reason.',
        tier: 1 as const,
      });

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'pastoral_case',
        expect.anything(),
        'PC',
      );
    });
  });

  // ─── create — additional branches ──────────────────────────────────────────

  describe('create — additional branches', () => {
    it('should reject when some concerns are already linked to another case', async () => {
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ id: CONCERN_ID_A, case_id: 'another-case-id' }),
      ]);

      await expect(
        service.create(TENANT_ID, USER_ID_A, {
          student_id: STUDENT_ID,
          concern_ids: [CONCERN_ID_A],
          owner_user_id: USER_ID_A,
          opened_reason: 'Test reason.',
          tier: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create additional student links when provided', async () => {
      const concerns = [makeConcern()];
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });
      // Mock createMany for additional students
      (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany = jest
        .fn()
        .mockResolvedValue({ count: 1 });

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test reason.',
        tier: 1,
        additional_student_ids: [STUDENT_ID_B],
      });

      expect(
        (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            case_id: CASE_ID,
            student_id: STUDENT_ID_B,
            tenant_id: TENANT_ID,
          }),
        ],
      });
    });

    it('should not duplicate primary student in additional links', async () => {
      const concerns = [makeConcern()];
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });
      (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany = jest
        .fn()
        .mockResolvedValue({ count: 0 });

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test reason.',
        tier: 1,
        additional_student_ids: [STUDENT_ID, STUDENT_ID_B], // includes primary
      });

      // Primary student should be filtered out
      expect(
        (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            student_id: STUDENT_ID_B,
          }),
        ],
      });
    });

    it('should handle empty additional_student_ids after filtering', async () => {
      const concerns = [makeConcern()];
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });
      (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany = jest.fn();

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test reason.',
        tier: 1,
        additional_student_ids: [STUDENT_ID], // only primary, will be filtered out
      });

      // createMany should NOT be called since there are no additional students after filtering
      expect(
        (mockRlsTx.pastoralCaseStudent as Record<string, jest.Mock>).createMany,
      ).not.toHaveBeenCalled();
    });

    it('should set next_review_date when provided', async () => {
      const concerns = [makeConcern()];
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(concerns);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(concerns[0]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(
        makeCase({ next_review_date: new Date('2026-04-15') }),
      );
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({
        case_id: CASE_ID,
        student_id: STUDENT_ID,
      });

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test reason.',
        tier: 1,
        next_review_date: '2026-04-15',
      });

      expect(mockRlsTx.pastoralCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          next_review_date: expect.any(Date),
        }),
      });
    });
  });

  // ─── update — additional branches ──────────────────────────────────────────

  describe('update — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, USER_ID_A, 'nonexistent-id', {
          tier: 2,
        }),
      ).rejects.toThrow();
    });

    it('should update next_review_date to a new date', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.update.mockResolvedValue(
        makeCase({ next_review_date: new Date('2026-05-01') }),
      );

      const result = await service.update(TENANT_ID, USER_ID_A, CASE_ID, {
        next_review_date: '2026-05-01',
      });

      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            next_review_date: expect.any(Date),
          }),
        }),
      );
      expect(result.data).toBeDefined();
    });

    it('should clear next_review_date when set to null', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(
        makeCase({ next_review_date: new Date('2026-04-01') }),
      );
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ next_review_date: null }));

      await service.update(TENANT_ID, USER_ID_A, CASE_ID, {
        next_review_date: null,
      });

      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            next_review_date: null,
          }),
        }),
      );
    });

    it('should update tier', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ tier: 1 }));
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ tier: 2 }));

      const result = await service.update(TENANT_ID, USER_ID_A, CASE_ID, {
        tier: 2,
      });

      expect(result.data.tier).toBe(2);
    });

    it('should update legal_hold', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ legal_hold: false }));
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ legal_hold: true }));

      const result = await service.update(TENANT_ID, USER_ID_A, CASE_ID, {
        legal_hold: true,
      });

      expect(result.data.legal_hold).toBe(true);
    });

    it('should update owner_user_id', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ owner_user_id: USER_ID_B }));

      await service.update(TENANT_ID, USER_ID_A, CASE_ID, {
        owner_user_id: USER_ID_B,
      });

      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            owner: { connect: { id: USER_ID_B } },
          }),
        }),
      );
    });
  });

  // ─── linkConcern — additional branches ─────────────────────────────────────

  describe('linkConcern — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.linkConcern(TENANT_ID, USER_ID_A, 'nonexistent', {
          concern_id: CONCERN_ID_A,
        }),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException when concern not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(null);

      await expect(
        service.linkConcern(TENANT_ID, USER_ID_A, CASE_ID, {
          concern_id: 'nonexistent-concern',
        }),
      ).rejects.toThrow();
    });

    it('should throw BadRequestException when concern linked to another case', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_A, case_id: 'another-case-id' }),
      );

      await expect(
        service.linkConcern(TENANT_ID, USER_ID_A, CASE_ID, {
          concern_id: CONCERN_ID_A,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should be idempotent when concern already linked to this case', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_A, case_id: CASE_ID }),
      );

      await service.linkConcern(TENANT_ID, USER_ID_A, CASE_ID, {
        concern_id: CONCERN_ID_A,
      });

      // Should not fire event or update anything
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
      expect(mockRlsTx.pastoralConcern.update).not.toHaveBeenCalled();
    });
  });

  // ─── unlinkConcern — additional branches ───────────────────────────────────

  describe('unlinkConcern — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.unlinkConcern(TENANT_ID, USER_ID_A, 'nonexistent', CONCERN_ID_A),
      ).rejects.toThrow();
    });

    it('should throw BadRequestException when concern not linked to this case', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_A, case_id: 'another-case-id' }),
      );

      await expect(
        service.unlinkConcern(TENANT_ID, USER_ID_A, CASE_ID, CONCERN_ID_A),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when concern not found at all', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(null);

      await expect(
        service.unlinkConcern(TENANT_ID, USER_ID_A, CASE_ID, CONCERN_ID_A),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addStudent — additional branches ──────────────────────────────────────

  describe('addStudent — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.addStudent(TENANT_ID, USER_ID_A, 'nonexistent', {
          student_id: STUDENT_ID_B,
        }),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException when student not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.student.findFirst.mockResolvedValue(null);

      await expect(
        service.addStudent(TENANT_ID, USER_ID_A, CASE_ID, {
          student_id: 'nonexistent-student',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── removeStudent — additional branches ───────────────────────────────────

  describe('removeStudent — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.removeStudent(TENANT_ID, USER_ID_A, 'nonexistent', STUDENT_ID_B),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException when student link not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ student_id: STUDENT_ID }));
      mockRlsTx.pastoralCaseStudent.findUnique.mockResolvedValue(null);

      await expect(
        service.removeStudent(TENANT_ID, USER_ID_A, CASE_ID, STUDENT_ID_B),
      ).rejects.toThrow();
    });
  });

  // ─── transferOwnership — additional branches ──────────────────────────────

  describe('transferOwnership — additional branches', () => {
    it('should throw NotFoundException when case not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(
        service.transferOwnership(TENANT_ID, USER_ID_A, 'nonexistent', {
          new_owner_user_id: USER_ID_B,
          reason: 'Test.',
        }),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException when new owner not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());

      // The service calls authReadFacade.findUserSummary which returns null
      const module2 = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          CaseService,
          CaseQueriesService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: SequenceService, useValue: mockSequenceService },
          { provide: PastoralEventService, useValue: mockPastoralEventService },
          {
            provide: AuthReadFacade,
            useValue: { findUserSummary: jest.fn().mockResolvedValue(null) },
          },
        ],
      }).compile();

      const service2 = module2.get<CaseService>(CaseService);

      await expect(
        service2.transferOwnership(TENANT_ID, USER_ID_A, CASE_ID, {
          new_owner_user_id: 'nonexistent-user',
          reason: 'Test.',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── recalculateTier — edge cases ─────────────────────────────────────────

  describe('recalculateTier — edge cases', () => {
    it('should default to tier 1 when no concerns remain', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ tier: 3 }));
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ id: CONCERN_ID_A, case_id: CASE_ID, tier: 3 }),
      );
      mockRlsTx.pastoralConcern.count.mockResolvedValue(2);
      mockRlsTx.pastoralConcern.update.mockResolvedValue(makeConcern({ case_id: null }));
      // After unlink, no concerns remain for this case
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ tier: 1 }));

      await service.unlinkConcern(TENANT_ID, USER_ID_A, CASE_ID, CONCERN_ID_A);

      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 1 }),
        }),
      );
    });
  });

  // ─── toPrismaStatus — invalid status ──────────────────────────────────────

  describe('transition — invalid status value', () => {
    it('should throw when transitioning to a status not in STATUS_TO_ENUM', async () => {
      // Simulate an existing case at 'open' trying to transition to a nonsense status
      // First, the transition validator in shared package will reject it
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ status: 'open' }));

      await expect(
        service.transition(TENANT_ID, USER_ID_A, CASE_ID, {
          status: 'nonexistent_status' as 'active',
          reason: 'Test.',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── transition — side effects for resolved/closed/reopen ─────────────────

  describe('transition — side effect branches', () => {
    it('should NOT clear resolved_at/closed_at for non-reopen transitions', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ status: 'active' }));
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase({ status: 'monitoring' }));

      await service.transition(TENANT_ID, USER_ID_A, CASE_ID, {
        status: 'monitoring',
        reason: 'Stepping down.',
      });

      const updateCall = mockRlsTx.pastoralCase.update.mock.calls[0]?.[0];
      const data = updateCall?.data as Record<string, unknown>;
      expect(data.resolved_at).toBeUndefined();
      expect(data.closed_at).toBeUndefined();
    });

    it('should set both resolved_at on resolved transition', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase({ status: 'monitoring' }));
      mockRlsTx.pastoralCase.update.mockResolvedValue(
        makeCase({ status: 'resolved', resolved_at: new Date() }),
      );

      await service.transition(TENANT_ID, USER_ID_A, CASE_ID, {
        status: 'resolved',
        reason: 'Goals met.',
      });

      const updateCall = mockRlsTx.pastoralCase.update.mock.calls[0]?.[0];
      const data = updateCall?.data as Record<string, unknown>;
      expect(data.resolved_at).toBeInstanceOf(Date);
    });
  });

  // ─── create — additional_student_ids undefined ────────────────────────────

  describe('create — additional_student_ids not provided', () => {
    it('should not create additional student links when additional_student_ids is undefined', async () => {
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({ id: CONCERN_ID_A, tier: 1, case_id: null }),
      ]);
      mockRlsTx.pastoralCase.create.mockResolvedValue(makeCase());
      mockRlsTx.pastoralConcern.updateMany.mockResolvedValue({ count: 1 });
      mockRlsTx.pastoralCaseStudent.create.mockResolvedValue({});

      await service.create(TENANT_ID, USER_ID_A, {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID_A],
        owner_user_id: USER_ID_A,
        opened_reason: 'Test case',
        tier: 1,
      });

      expect(mockRlsTx.pastoralCaseStudent.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── update — no fields updated ───────────────────────────────────────────

  describe('update — empty DTO', () => {
    it('should handle empty update DTO gracefully', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(makeCase());
      mockRlsTx.pastoralCase.update.mockResolvedValue(makeCase());

      const result = await service.update(TENANT_ID, USER_ID_A, CASE_ID, {});

      expect(result.data).toBeDefined();
      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {},
        }),
      );
    });
  });
});
