import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';

import { PrismaService } from '../../prisma/prisma.service';

import { AuthorMaskingInterceptor } from './author-masking.interceptor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_STAFF = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_DLP = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID_PARENT = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const MEMBERSHIP_STAFF = 'ms-staff-1';
const MEMBERSHIP_PARENT = 'ms-parent-1';

// ─── Mock helpers ───────────────────────────────────────────────────────────

const makeStaffJwt = (userId: string, membershipId: string) => ({
  sub: userId,
  email: 'staff@alnoor.test',
  tenant_id: TENANT_ID,
  membership_id: membershipId,
  type: 'access' as const,
  iat: 1711000000,
  exp: 1711003600,
});

const makeExecutionContext = (
  jwt: ReturnType<typeof makeStaffJwt>,
): ExecutionContext => {
  const request = {
    currentUser: jwt,
    tenantContext: { tenant_id: TENANT_ID },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => Object,
    getHandler: () => Object,
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({} as ReturnType<ExecutionContext['switchToRpc']>),
    switchToWs: () => ({} as ReturnType<ExecutionContext['switchToWs']>),
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
};

const makeCallHandler = (responseData: unknown): CallHandler => ({
  handle: () => of(responseData),
});

/**
 * Builds a concern-like object with author fields.
 */
const makeConcernResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 'concern-1',
  tenant_id: TENANT_ID,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  logged_by_user_id: USER_ID_STAFF,
  logged_by: { first_name: 'Jane', last_name: 'Teacher' },
  author_name: 'Jane Teacher',
  author_masked: false,
  created_at: '2026-03-15T10:00:00Z',
  ...overrides,
});

/**
 * Builds a concern version response with author fields.
 */
const makeConcernVersionResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1',
  concern_id: 'concern-1',
  version_number: 1,
  narrative: 'Some narrative text.',
  amended_by_user_id: USER_ID_STAFF,
  amended_by: { first_name: 'Jane', last_name: 'Teacher' },
  amended_by_name: 'Jane Teacher',
  author_masked: false,
  ...overrides,
});

// ─── Staff role permission mocks ────────────────────────────────────────────

const makeStaffRoles = () => [
  {
    role: {
      role_permissions: [
        {
          permission: { permission_key: 'pastoral.view_tier1' },
        },
        {
          permission: { permission_key: 'pastoral.view_tier2' },
        },
      ],
    },
  },
];

const makeParentRoles = () => [
  {
    role: {
      role_permissions: [
        {
          permission: { permission_key: 'parent.view_child' },
        },
        {
          permission: { permission_key: 'parent.view_reports' },
        },
      ],
    },
  },
];

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AuthorMaskingInterceptor', () => {
  let interceptor: AuthorMaskingInterceptor;
  let mockPrisma: {
    cpAccessGrant: { findFirst: jest.Mock };
    membershipRole: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      cpAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      membershipRole: {
        findMany: jest.fn().mockResolvedValue(makeStaffRoles()),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorMaskingInterceptor,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    interceptor = module.get<AuthorMaskingInterceptor>(
      AuthorMaskingInterceptor,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Tier 1/2 staff (non-DLP) ──────────────────────────────────────────

  describe('non-DLP staff viewer', () => {
    it('author_masked=false, viewer=staff: sees author name', async () => {
      // No CP access
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const concern = makeConcernResponse({ author_masked: false });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Staff sees real author when author_masked is false
      expect(result.logged_by_user_id).toBe(USER_ID_STAFF);
      expect(result.author_name).toBe('Jane Teacher');
      expect(result.logged_by).toBeDefined();
    });

    it('author_masked=true, viewer=staff without CP access: author masked', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const concern = makeConcernResponse({ author_masked: true });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Staff sees masked author when author_masked is true
      expect(result.logged_by_user_id).toBeNull();
      expect(result.author_name).toBe('Author masked');
      expect(result.logged_by).toBeNull();
    });
  });

  // ─── DLP viewer ─────────────────────────────────────────────────────────

  describe('DLP viewer', () => {
    it('author_masked=true, viewer=DLP: sees author name (DLP bypass)', async () => {
      // DLP has active CP access grant
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
      });
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const concern = makeConcernResponse({ author_masked: true });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_DLP, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // DLP always sees real author, even when author_masked is true
      expect(result.logged_by_user_id).toBe(USER_ID_STAFF);
      expect(result.author_name).toBe('Jane Teacher');
      expect(result.logged_by).toBeDefined();
    });

    it('author_masked=false, viewer=DLP: sees author name', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
      });
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const concern = makeConcernResponse({ author_masked: false });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_DLP, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      expect(result.logged_by_user_id).toBe(USER_ID_STAFF);
      expect(result.author_name).toBe('Jane Teacher');
    });
  });

  // ─── Parent viewer ──────────────────────────────────────────────────────

  describe('parent viewer', () => {
    it('author_masked=true, viewer=parent: author masked (parents never see)', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeParentRoles());

      const concern = makeConcernResponse({ author_masked: true });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_PARENT, MEMBERSHIP_PARENT),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Parents never see author information
      expect(result.logged_by_user_id).toBeNull();
      expect(result.author_name).toBe('Author masked');
      expect(result.logged_by).toBeNull();
    });

    it('author_masked=false, viewer=parent: author STILL masked (parents never see)', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeParentRoles());

      const concern = makeConcernResponse({ author_masked: false });
      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_PARENT, MEMBERSHIP_PARENT),
      );
      const handler = makeCallHandler(concern);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Parents NEVER see author, regardless of author_masked flag
      expect(result.logged_by_user_id).toBeNull();
      expect(result.author_name).toBe('Author masked');
      expect(result.logged_by).toBeNull();
    });
  });

  // ─── nested objects ───────────────────────────────────────────────────────

  describe('nested objects', () => {
    it('should handle nested objects (concern with versions)', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const concernWithVersions = makeConcernResponse({
        author_masked: true,
        versions: [
          makeConcernVersionResponse({
            author_masked: true,
            amended_by_user_id: USER_ID_STAFF,
          }),
        ],
      });

      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(concernWithVersions);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Top-level concern author masked
      expect(result.logged_by_user_id).toBeNull();

      // Nested version author also masked
      const versions = result.versions as Array<Record<string, unknown>>;
      expect(versions).toHaveLength(1);
      expect(versions[0]!.amended_by_user_id).toBeNull();
      expect(versions[0]!.amended_by_name).toBe('Author masked');
    });
  });

  // ─── paginated responses ──────────────────────────────────────────────────

  describe('paginated responses', () => {
    it('should apply masking to paginated responses', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const paginatedResponse = {
        data: [
          makeConcernResponse({ author_masked: true, id: 'c-1' }),
          makeConcernResponse({ author_masked: false, id: 'c-2' }),
        ],
        meta: { page: 1, pageSize: 20, total: 2 },
      };

      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(paginatedResponse);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as {
        data: Array<Record<string, unknown>>;
        meta: { page: number; pageSize: number; total: number };
      };

      // First concern: author_masked=true -> masked
      expect(result.data[0]!.logged_by_user_id).toBeNull();
      expect(result.data[0]!.author_name).toBe('Author masked');

      // Second concern: author_masked=false -> visible
      expect(result.data[1]!.logged_by_user_id).toBe(USER_ID_STAFF);
      expect(result.data[1]!.author_name).toBe('Jane Teacher');

      // Meta preserved
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('should apply masking to chronology entries', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const chronologyResponse = {
        data: [
          {
            id: 'ev-1',
            event_type: 'concern_created',
            entity_type: 'concern',
            entity_id: 'concern-1',
            timestamp: '2026-03-15T10:00:00Z',
            tier: 1,
            logged_by_user_id: USER_ID_STAFF,
            logged_by: { first_name: 'Jane', last_name: 'Teacher' },
            author_name: 'Jane Teacher',
            author_masked: true,
            summary: 'Academic concern raised.',
            payload: {},
          },
        ],
        meta: { page: 1, pageSize: 50, total: 1 },
      };

      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(chronologyResponse);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as {
        data: Array<Record<string, unknown>>;
      };

      // Chronology entry with author_masked=true should be masked for staff
      expect(result.data[0]!.logged_by_user_id).toBeNull();
      expect(result.data[0]!.author_name).toBe('Author masked');
      expect(result.data[0]!.logged_by).toBeNull();
    });
  });

  // ─── no-op when author fields absent ────────────────────────────────────

  describe('graceful handling', () => {
    it('should be a no-op when author fields do not exist on the object', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      // Object without any author-related fields
      const nonAuthorData = {
        id: 'case-1',
        case_number: 'PC-202603-000001',
        status: 'open',
        tier: 1,
      };

      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(nonAuthorData);

      const result$ = interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(result$)) as Record<string, unknown>;

      // Object passes through unchanged
      expect(result.id).toBe('case-1');
      expect(result.case_number).toBe('PC-202603-000001');
      expect(result.status).toBe('open');
      expect(result.tier).toBe(1);
    });

    it('should handle null response gracefully', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(makeStaffRoles());

      const ctx = makeExecutionContext(
        makeStaffJwt(USER_ID_STAFF, MEMBERSHIP_STAFF),
      );
      const handler = makeCallHandler(null);

      const result$ = interceptor.intercept(ctx, handler);
      const result = await lastValueFrom(result$);

      expect(result).toBeNull();
    });
  });
});
