import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { CaseFilters } from '@school/shared/pastoral';

import { PrismaService } from '../../prisma/prisma.service';

import { CaseQueriesService } from './case-queries.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CASE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralCase: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
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

const makeCaseRow = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_ID,
  tenant_id: TENANT_ID,
  case_number: 'PC-202603-000001',
  status: 'open',
  student_id: STUDENT_ID,
  owner_user_id: USER_ID,
  opened_by_user_id: USER_ID,
  opened_reason: 'Welfare concern raised.',
  tier: 1,
  legal_hold: false,
  next_review_date: null,
  resolved_at: null,
  closed_at: null,
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  student: { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
  owner: { first_name: 'John', last_name: 'Doe' },
  opened_by: { first_name: 'John', last_name: 'Doe' },
  concerns: [{ id: 'concern-1' }],
  case_students: [
    {
      student_id: STUDENT_ID,
      added_at: new Date('2026-03-15T10:00:00Z'),
      student: { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
    },
  ],
  ...overrides,
});

const makeDefaultFilters = (overrides: Partial<CaseFilters> = {}): CaseFilters => ({
  page: 1,
  pageSize: 20,
  sort: 'created_at',
  order: 'desc',
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CaseQueriesService', () => {
  let service: CaseQueriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CaseQueriesService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<CaseQueriesService>(CaseQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────

  describe('CaseQueriesService — findAll', () => {
    it('should return paginated results with DTOs', async () => {
      const row = makeCaseRow();
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([row]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters());

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: CASE_ID,
          case_number: 'PC-202603-000001',
          student_name: 'Alice Smith',
          owner_name: 'John Doe',
          concern_count: 1,
          student_count: 1,
        }),
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should apply status filter', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters({ status: 'active' }));

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('active');
    });

    it('should apply student_id filter with OR clause', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters({ student_id: STUDENT_ID }));

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toEqual([
        { student_id: STUDENT_ID },
        { case_students: { some: { student_id: STUDENT_ID } } },
      ]);
    });

    it('should apply date range filter', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(
        TENANT_ID,
        USER_ID,
        makeDefaultFilters({ date_from: '2026-01-01', date_to: '2026-03-31' }),
      );

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.created_at).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-03-31'),
      });
    });

    it('should sort by next_review_date', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(
        TENANT_ID,
        USER_ID,
        makeDefaultFilters({ sort: 'next_review_date', order: 'asc' }),
      );

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ next_review_date: 'asc' });
    });

    it('should apply owner_user_id filter', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters({ owner_user_id: USER_ID }));

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.owner_user_id).toBe(USER_ID);
    });

    it('should apply tier filter', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters({ tier: 2 }));

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.tier).toBe(2);
    });

    it('should handle null owner and missing student in DTO mapping', async () => {
      const row = makeCaseRow({
        owner: null,
        student: null,
        concerns: [],
        case_students: [],
      });
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([row]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters());

      expect(result.data[0]!.owner_name).toBeNull();
      expect(result.data[0]!.student_name).toBe('Unknown');
      expect(result.data[0]!.concern_count).toBe(0);
      expect(result.data[0]!.student_count).toBe(0);
    });

    it('should apply date_from only without date_to', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, makeDefaultFilters({ date_from: '2026-01-01' }));

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.created_at).toEqual({ gte: new Date('2026-01-01') });
    });

    it('should sort by status', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralCase.count.mockResolvedValue(0);

      await service.findAll(
        TENANT_ID,
        USER_ID,
        makeDefaultFilters({ sort: 'status', order: 'desc' }),
      );

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual({ status: 'desc' });
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────

  describe('CaseQueriesService — findById', () => {
    it('should return a detail DTO', async () => {
      const row = makeCaseRow({
        concerns: [
          {
            id: 'concern-1',
            category: 'academic',
            severity: 'routine',
            tier: 1,
            created_at: new Date('2026-03-10T08:00:00Z'),
            versions: [
              {
                id: 'v-1',
                version_number: 1,
                narrative: 'Student struggling with maths.',
                created_at: new Date('2026-03-10T08:00:00Z'),
              },
            ],
          },
        ],
      });
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(row);

      const result = await service.findById(TENANT_ID, USER_ID, CASE_ID);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: CASE_ID,
          case_number: 'PC-202603-000001',
          student_name: 'Alice Smith',
          owner_name: 'John Doe',
          opened_by_name: 'John Doe',
          opened_reason: 'Welfare concern raised.',
          legal_hold: false,
          concerns: [
            expect.objectContaining({
              id: 'concern-1',
              latest_narrative: 'Student struggling with maths.',
            }),
          ],
          students: [
            expect.objectContaining({
              student_id: STUDENT_ID,
              name: 'Alice Smith',
              is_primary: true,
            }),
          ],
        }),
      );
      expect(typeof result.data.days_open).toBe('number');
    });

    it('should map detail DTO with null relations and empty arrays', async () => {
      const row = makeCaseRow({
        owner: null,
        opened_by: null,
        student: null,
        concerns: [],
        case_students: [],
      });
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(row);

      const result = await service.findById(TENANT_ID, USER_ID, CASE_ID);

      expect(result.data.owner_name).toBeNull();
      expect(result.data.opened_by_name).toBeNull();
      expect(result.data.student_name).toBe('Unknown');
      expect(result.data.concerns).toEqual([]);
      expect(result.data.students).toEqual([]);
    });

    it('should map concern with no versions to null latest_narrative', async () => {
      const row = makeCaseRow({
        concerns: [
          {
            id: 'concern-no-ver',
            category: 'emotional',
            severity: 'elevated',
            tier: 2,
            created_at: new Date('2026-03-10T08:00:00Z'),
            versions: [],
          },
        ],
      });
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(row);

      const result = await service.findById(TENANT_ID, USER_ID, CASE_ID);

      expect(result.data.concerns[0]!.latest_narrative).toBeNull();
    });

    it('should map case_student with null student to Unknown name', async () => {
      const row = makeCaseRow({
        case_students: [
          {
            student_id: 'other-student',
            added_at: new Date(),
            student: null,
          },
        ],
      });
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(row);

      const result = await service.findById(TENANT_ID, USER_ID, CASE_ID);

      expect(result.data.students[0]!.name).toBe('Unknown');
      expect(result.data.students[0]!.is_primary).toBe(false);
    });

    it('should throw NotFoundException when case is not found', async () => {
      mockRlsTx.pastoralCase.findUnique.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, USER_ID, CASE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findMyCases ────────────────────────────────────────────────────────

  describe('CaseQueriesService — findMyCases', () => {
    it("should return the user's non-closed cases", async () => {
      const row = makeCaseRow({ status: 'active' });
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([row]);

      const result = await service.findMyCases(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: CASE_ID,
          status: 'active',
          owner_user_id: USER_ID,
        }),
      );

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.owner_user_id).toBe(USER_ID);
      expect(findManyCall.where.status).toEqual({ notIn: ['closed'] });
    });
  });

  // ─── findOrphans ────────────────────────────────────────────────────────

  describe('CaseQueriesService — findOrphans', () => {
    it('should return non-closed cases with no linked concerns', async () => {
      const orphan = {
        id: CASE_ID,
        case_number: 'PC-202603-000002',
        status: 'open',
        owner_user_id: USER_ID,
        created_at: new Date('2026-03-20T10:00:00Z'),
      };
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([orphan]);

      const result = await service.findOrphans(TENANT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: CASE_ID,
          case_number: 'PC-202603-000002',
          status: 'open',
          owner_user_id: USER_ID,
        }),
      );

      const findManyCall = mockRlsTx.pastoralCase.findMany.mock.calls[0][0];
      expect(findManyCall.where.concerns).toEqual({ none: {} });
      expect(findManyCall.where.status).toEqual({ not: 'closed' });
    });
  });
});
