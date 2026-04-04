import { Test, TestingModule } from '@nestjs/testing';

import type { ListConcernsQuery } from '@school/shared/pastoral';

import {
  MOCK_FACADE_PROVIDERS,
  ConfigurationReadFacade,
  ChildProtectionReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ConcernQueriesService } from './concern-queries.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCERN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Default Categories ────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { key: 'academic', label: 'Academic', active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'inactive_cat', label: 'Inactive Category', active: false },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeTenantSettingsRecord = (pastoralOverrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      concern_categories: DEFAULT_CATEGORIES,
      ...pastoralOverrides,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeConcernRow = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  logged_by_user_id: USER_ID,
  author_masked: false,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  occurred_at: new Date('2026-03-01T10:00:00Z'),
  location: null,
  witnesses: null,
  actions_taken: null,
  follow_up_needed: false,
  follow_up_suggestion: null,
  case_id: null,
  behaviour_incident_id: null,
  parent_shareable: false,
  parent_share_level: null,
  shared_by_user_id: null,
  shared_at: null,
  legal_hold: false,
  imported: false,
  acknowledged_at: null,
  acknowledged_by_user_id: null,
  created_at: new Date('2026-03-01T10:00:00Z'),
  updated_at: new Date('2026-03-01T10:00:00Z'),
  logged_by: { first_name: 'Jane', last_name: 'Teacher' },
  student: { id: STUDENT_ID, first_name: 'John', last_name: 'Smith' },
  involved_students: [],
  ...overrides,
});

const makeBaseQuery = (overrides: Partial<ListConcernsQuery> = {}): ListConcernsQuery => ({
  page: 1,
  pageSize: 20,
  sort: 'created_at',
  order: 'desc',
  ...overrides,
});

// ─── RLS mock ──────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralConcern: {
    findMany: jest.fn(),
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

// ─── Mock Prisma ───────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  cpAccessGrant: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findUnique: jest.fn(),
  },
});

const buildMockConfigFacade = () => ({
  findSettings: jest.fn(),
});

const buildMockCpFacade = () => ({
  hasActiveCpAccess: jest.fn().mockResolvedValue(false),
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('ConcernQueriesService', () => {
  let service: ConcernQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockConfigFacade: ReturnType<typeof buildMockConfigFacade>;
  let mockCpFacade: ReturnType<typeof buildMockCpFacade>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockConfigFacade = buildMockConfigFacade();
    mockCpFacade = buildMockCpFacade();

    // Reset RLS mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ConcernQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        { provide: ChildProtectionReadFacade, useValue: mockCpFacade },
      ],
    }).compile();

    service = module.get<ConcernQueriesService>(ConcernQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ────────────────────────────────────────────────────────────────

  describe('ConcernQueriesService — list', () => {
    it('should return paginated results', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([makeConcernRow()]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier1'],
        makeBaseQuery(),
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
      });
    });

    it('should filter by tier when caller max tier < 2', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(TENANT_ID, USER_ID, ['pastoral.view_tier1'], makeBaseQuery());

      // Tier 1 only user: where clause should restrict to tier 1
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tier: 1 }),
        }),
      );
    });

    it('should return empty when requested tier exceeds access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);

      const result = await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier1'],
        makeBaseQuery({ tier: 3 }),
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      // Should not call DB at all
      expect(mockRlsTx.pastoralConcern.findMany).not.toHaveBeenCalled();
    });

    it('should filter by student_id with OR clause', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ student_id: STUDENT_ID }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { student_id: STUDENT_ID },
              expect.objectContaining({
                involved_students: expect.objectContaining({
                  some: expect.objectContaining({ student_id: STUDENT_ID }),
                }),
              }),
            ]),
          }),
        }),
      );
    });

    it('should filter by category', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ category: 'bullying' }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'bullying' }),
        }),
      );
    });

    it('should filter by severity', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ severity: 'urgent' }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: 'urgent' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ from: '2026-01-01', to: '2026-03-31' }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-03-31'),
            },
          }),
        }),
      );
    });

    it('should sort by occurred_at when specified', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ sort: 'occurred_at', order: 'asc' }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { occurred_at: 'asc' },
        }),
      );
    });

    it('should sort by severity when specified', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      await service.list(
        TENANT_ID,
        USER_ID,
        ['pastoral.view_tier2'],
        makeBaseQuery({ sort: 'severity', order: 'desc' }),
      );

      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { severity: 'desc' },
        }),
      );
    });
  });

  // ─── getCategories ─────────────────────────────────────────────────────────

  describe('ConcernQueriesService — getCategories', () => {
    it('should return only active categories', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.getCategories(TENANT_ID);

      expect(result.data).toHaveLength(2); // academic + child_protection (inactive_cat excluded)
      expect(result.data.every((c) => c.active)).toBe(true);
      expect(result.data.find((c) => c.key === 'inactive_cat')).toBeUndefined();
    });

    it('should handle missing settings by returning defaults', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(null);

      const result = await service.getCategories(TENANT_ID);

      // Zod schema provides defaults — the result should be an array
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
