import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ConcernService } from './concern.service';
import { ConcernVersionService } from './concern-version.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // author
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // viewer (non-DLP)
const USER_ID_DLP = 'dddddddd-dddd-dddd-dddd-dddddddddddd'; // DLP user
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONCERN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralConcern: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcernVersion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { key: 'academic', label: 'Academic', active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', active: true },
  { key: 'inactive_cat', label: 'Inactive Category', active: false },
];

/**
 * Builds a mock TenantSetting record matching what the service expects from
 * `this.prisma.tenantSetting.findUnique({ where: { tenant_id } })`.
 * The service accesses `record?.settings.pastoral`, then parses with Zod.
 */
const makeTenantSettingsRecord = (
  pastoralOverrides: Record<string, unknown> = {},
) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      concern_categories: DEFAULT_CATEGORIES,
      masked_authorship_enabled: true,
      ...pastoralOverrides,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  logged_by_user_id: USER_ID_A,
  author_masked: false,
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
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ConcernService', () => {
  let service: ConcernService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockConcernVersionService: {
    createInitialVersion: jest.Mock;
    amendNarrative: jest.Mock;
    listVersions: jest.Mock;
  };
  let mockPermissionCacheService: { getPermissions: jest.Mock };
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
    cpAccessGrant: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockConcernVersionService = {
      createInitialVersion: jest.fn().mockResolvedValue({
        id: 'version-1',
        concern_id: CONCERN_ID,
        version_number: 1,
        narrative: 'Test narrative text for concern.',
        amended_by_user_id: USER_ID_A,
        amendment_reason: null,
      }),
      amendNarrative: jest.fn(),
      listVersions: jest.fn(),
    };

    mockPermissionCacheService = {
      getPermissions: jest.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(makeTenantSettingsRecord()),
      },
      cpAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConcernService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        {
          provide: ConcernVersionService,
          useValue: mockConcernVersionService,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    }).compile();

    service = module.get<ConcernService>(ConcernService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      category: 'academic',
      severity: 'routine' as const,
      narrative: 'Student is struggling with maths concepts in class.',
      occurred_at: '2026-03-01T10:00:00Z',
      author_masked: false,
    };

    const setupCreateMocks = (overrides: Record<string, unknown> = {}) => {
      const concern = makeConcern(overrides);
      mockRlsTx.pastoralConcern.create.mockResolvedValue(concern);
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(concern);
    };

    it('creates a concern with valid data', async () => {
      setupCreateMocks();

      const result = await service.create(
        TENANT_ID,
        USER_ID_A,
        baseDto,
        '127.0.0.1',
      );

      // Verify concern was created
      expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          category: 'academic',
          severity: 'routine',
          logged_by_user_id: USER_ID_A,
        }),
      });

      // Verify v1 version was created
      expect(
        mockConcernVersionService.createInitialVersion,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockConcernVersionService.createInitialVersion,
      ).toHaveBeenCalledWith(
        expect.anything(), // tx client
        TENANT_ID,
        expect.any(String), // concern ID
        USER_ID_A,
        baseDto.narrative,
      );

      // Verify concern_created event was written (fire-and-forget)
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_created',
          entity_type: 'concern',
        }),
      );

      expect(result.data).toBeDefined();
    });

    it('validates category against tenant settings', async () => {
      // Invalid category (not in tenant settings)
      await expect(
        service.create(
          TENANT_ID,
          USER_ID_A,
          { ...baseDto, category: 'nonexistent' },
          null,
        ),
      ).rejects.toThrow(BadRequestException);

      // Inactive category
      await expect(
        service.create(
          TENANT_ID,
          USER_ID_A,
          { ...baseDto, category: 'inactive_cat' },
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-sets tier to 3 for child_protection category', async () => {
      setupCreateMocks({ category: 'child_protection', tier: 3 });

      const result = await service.create(
        TENANT_ID,
        USER_ID_A,
        { ...baseDto, category: 'child_protection' },
        null,
      );

      // Service should set tier = 3 because child_protection has auto_tier: 3
      expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'child_protection',
          tier: 3,
        }),
      });

      expect(result.data.tier).toBe(3);
    });

    it('auto-sets tier to 3 for self_harm category', async () => {
      setupCreateMocks({ category: 'self_harm', tier: 3 });

      const result = await service.create(
        TENANT_ID,
        USER_ID_A,
        { ...baseDto, category: 'self_harm' },
        null,
      );

      expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'self_harm',
          tier: 3,
        }),
      });

      expect(result.data.tier).toBe(3);
    });

    it('rejects author_masked when tenant disables it', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ masked_authorship_enabled: false }),
      );

      await expect(
        service.create(
          TENANT_ID,
          USER_ID_A,
          { ...baseDto, author_masked: true },
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── list & author masking ────────────────────────────────────────────────

  describe('list', () => {
    const defaultQuery = {
      page: 1,
      pageSize: 20,
      sort: 'created_at' as const,
      order: 'desc' as const,
    };

    it('applies author masking for non-DLP viewer', async () => {
      const maskedConcern = makeConcern({
        author_masked: true,
        logged_by_user_id: USER_ID_A,
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([maskedConcern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);
      // Non-DLP user has no cp_access_grants
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.list(
        TENANT_ID,
        USER_ID_B,
        ['pastoral.view_tier1'],
        defaultQuery,
      );

      expect(result.data).toHaveLength(1);
      // Non-DLP viewer should see masked author
      const item = result.data[0]!;
      expect(item.logged_by_user_id).toBeNull();
      expect(item.author_name).toBe('Author masked');
    });

    it('DLP sees real author even when masked', async () => {
      const maskedConcern = makeConcern({
        author_masked: true,
        logged_by_user_id: USER_ID_A,
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([maskedConcern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);
      // DLP user has an active cp_access_grant
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
      });

      const result = await service.list(
        TENANT_ID,
        USER_ID_DLP,
        ['pastoral.view_tier1', 'pastoral.view_tier2'],
        defaultQuery,
      );

      expect(result.data).toHaveLength(1);
      const item = result.data[0]!;
      // DLP sees real author even when masked
      expect(item.logged_by_user_id).toBe(USER_ID_A);
    });

    it('filters tier 2 concerns for tier 1 viewers', async () => {
      // The service filters in the where clause, so mock returns only what
      // the query would produce. For a tier-1-only user, the where includes
      // { tier: 1 }, so DB returns only tier 1 concerns.
      const tier1Concern = makeConcern({ id: 'concern-tier1', tier: 1 });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([tier1Concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.list(
        TENANT_ID,
        USER_ID_B,
        ['pastoral.view_tier1'], // NO pastoral.view_tier2
        defaultQuery,
      );

      // Verify the where clause was scoped to tier 1
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tier: 1 }),
        }),
      );

      // Tier 2 concerns should be filtered out for tier 1 only viewers
      const tiers = result.data.map(
        (c: { tier: number }) => c.tier,
      );
      expect(tiers).not.toContain(2);
    });

    it('includes tier 2 concerns for tier 2 viewers', async () => {
      const tier1Concern = makeConcern({ id: 'concern-tier1', tier: 1 });
      const tier2Concern = makeConcern({ id: 'concern-tier2', tier: 2 });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        tier1Concern,
        tier2Concern,
      ]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(2);
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.list(
        TENANT_ID,
        USER_ID_B,
        ['pastoral.view_tier1', 'pastoral.view_tier2'],
        defaultQuery,
      );

      expect(result.data).toHaveLength(2);
      const tiers = result.data.map(
        (c: { tier: number }) => c.tier,
      );
      expect(tiers).toContain(1);
      expect(tiers).toContain(2);
    });

    it('pagination returns correct meta', async () => {
      // Simulate 25 total concerns, page 2 with pageSize 10
      const pageConcerns = Array.from({ length: 10 }, (_, i) =>
        makeConcern({ id: `concern-${i + 10}`, tier: 1 }),
      );

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue(pageConcerns);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(25);
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.list(
        TENANT_ID,
        USER_ID_B,
        ['pastoral.view_tier1', 'pastoral.view_tier2'],
        { ...defaultQuery, page: 2, pageSize: 10 },
      );

      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 25,
          page: 2,
          pageSize: 10,
        }),
      );
      expect(result.data).toHaveLength(10);
    });
  });

  // ─── escalateTier ─────────────────────────────────────────────────────────

  describe('escalateTier', () => {
    it('escalates tier one-way only', async () => {
      // Tier 1 -> 2: should succeed
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ tier: 1 }),
      );
      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({ tier: 2 }),
      );

      const result = await service.escalateTier(
        TENANT_ID,
        USER_ID_A,
        CONCERN_ID,
        { new_tier: 2, reason: 'Escalation needed' },
        '127.0.0.1',
      );
      expect(result.data.tier).toBe(2);

      // Tier 2 -> 1: should fail (downgrade)
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ tier: 2 }),
      );

      await expect(
        service.escalateTier(
          TENANT_ID,
          USER_ID_A,
          CONCERN_ID,
          { new_tier: 1 as unknown as 2, reason: 'Attempting downgrade' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes concern_tier_escalated event on escalation', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ tier: 1 }),
      );
      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({ tier: 2 }),
      );

      await service.escalateTier(
        TENANT_ID,
        USER_ID_A,
        CONCERN_ID,
        { new_tier: 2, reason: 'Student situation deteriorated' },
        '127.0.0.1',
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_tier_escalated',
          entity_type: 'concern',
          entity_id: CONCERN_ID,
          payload: expect.objectContaining({
            old_tier: 1,
            new_tier: 2,
            reason: 'Student situation deteriorated',
          }),
        }),
      );
    });
  });

  // ─── markShareable ────────────────────────────────────────────────────────

  describe('markShareable', () => {
    it('marks concern shareable with correct fields', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(makeConcern());
      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({
          parent_shareable: true,
          parent_share_level: 'category_summary',
          shared_by_user_id: USER_ID_A,
          shared_at: new Date('2026-03-01T12:00:00Z'),
        }),
      );

      const result = await service.markShareable(
        TENANT_ID,
        USER_ID_A,
        CONCERN_ID,
        { share_level: 'category_summary' },
      );

      // Verify update was called with correct fields
      expect(mockRlsTx.pastoralConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parent_shareable: true,
            parent_share_level: 'category_summary',
            shared_by_user_id: USER_ID_A,
          }),
        }),
      );

      expect(result.data.parent_shareable).toBe(true);
      expect(result.data.parent_share_level).toBe('category_summary');
      expect(result.data.shared_by_user_id).toBe(USER_ID_A);
      expect(result.data.shared_at).toBeDefined();

      // Verify concern_shared_with_parent event
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'concern_shared_with_parent',
          payload: expect.objectContaining({
            concern_id: CONCERN_ID,
            share_level: 'category_summary',
            shared_by_user_id: USER_ID_A,
          }),
        }),
      );
    });
  });

  // ─── updateMetadata ───────────────────────────────────────────────────────

  describe('updateMetadata', () => {
    it('updates metadata without touching narrative', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        makeConcern({ severity: 'routine' }),
      );
      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({ severity: 'elevated' }),
      );

      const result = await service.updateMetadata(
        TENANT_ID,
        USER_ID_A,
        CONCERN_ID,
        { severity: 'elevated' },
      );

      expect(result.data.severity).toBe('elevated');

      // Verify update call includes severity but NOT narrative
      const updateCall = mockRlsTx.pastoralConcern.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).toHaveProperty('severity', 'elevated');
      expect(updateCall.data).not.toHaveProperty('narrative');

      // No version service call — metadata update does not create narrative version
      expect(
        mockConcernVersionService.createInitialVersion,
      ).not.toHaveBeenCalled();
    });
  });

  // ─── getById (acknowledge) ────────────────────────────────────────────────

  describe('getById', () => {
    it('sets acknowledged_at on first non-author view', async () => {
      const unacknowledgedConcern = makeConcern({
        acknowledged_at: null,
        acknowledged_by_user_id: null,
        logged_by_user_id: USER_ID_A,
        versions: [],
      });

      // getById fetches the concern via RLS
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(
        unacknowledgedConcern,
      );

      // acknowledge() creates its own RLS client and runs a separate tx,
      // which also calls findUnique + update on mockRlsTx
      mockRlsTx.pastoralConcern.update.mockResolvedValue(
        makeConcern({
          acknowledged_at: new Date(),
          acknowledged_by_user_id: USER_ID_B,
        }),
      );

      // Non-DLP user
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      // User B views the concern (not the author)
      await service.getById(
        TENANT_ID,
        USER_ID_B,
        ['pastoral.view_tier1'],
        CONCERN_ID,
        '127.0.0.1',
      );

      // Wait for fire-and-forget acknowledge to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have called update to set acknowledged_at
      expect(mockRlsTx.pastoralConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: CONCERN_ID }),
          data: expect.objectContaining({
            acknowledged_at: expect.any(Date),
            acknowledged_by_user_id: USER_ID_B,
          }),
        }),
      );

      // Should write concern_acknowledged event
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'concern_acknowledged',
          payload: expect.objectContaining({
            concern_id: CONCERN_ID,
            acknowledged_by_user_id: USER_ID_B,
          }),
        }),
      );
    });
  });
});
