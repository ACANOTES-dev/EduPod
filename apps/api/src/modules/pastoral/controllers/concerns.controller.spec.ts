import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { ConcernQueriesService } from '../services/concern-queries.service';
import { ConcernVersionService } from '../services/concern-version.service';
import { ConcernService } from '../services/concern.service';
import { PastoralEventService } from '../services/pastoral-event.service';

import { ConcernsController } from './concerns.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CONCERN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER = {
  sub: USER_ID,
  email: 'test@example.com',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const MOCK_REQ = { ip: '127.0.0.1' } as { ip: string };

const MOCK_PERMISSIONS = new Set([
  'pastoral.log_concern',
  'pastoral.view_tier1',
  'pastoral.view_tier2',
]);

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockConcernService = {
  create: jest.fn(),
  getById: jest.fn(),
  updateMetadata: jest.fn(),
  escalateTier: jest.fn(),
  shareConcernWithParent: jest.fn(),
  unshareConcernFromParent: jest.fn(),
};

const mockConcernQueriesService = {
  list: jest.fn(),
  getCategories: jest.fn(),
};

const mockVersionService = {
  amendNarrative: jest.fn(),
  listVersions: jest.fn(),
};

const mockEventService = {
  getEntityHistory: jest.fn(),
  getStudentChronology: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn().mockResolvedValue(MOCK_PERMISSIONS),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ConcernsController', () => {
  let controller: ConcernsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConcernsController],
      providers: [
        { provide: ConcernService, useValue: mockConcernService },
        { provide: ConcernQueriesService, useValue: mockConcernQueriesService },
        { provide: ConcernVersionService, useValue: mockVersionService },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConcernsController>(ConcernsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, ConcernsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', ConcernsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    it.each([
      ['create', 'pastoral.log_concern'],
      ['list', 'pastoral.view_tier1'],
      ['getById', 'pastoral.view_tier1'],
      ['updateMetadata', 'pastoral.view_tier2'],
      ['escalateTier', 'pastoral.view_tier2'],
      ['unshareConcernFromParent', 'pastoral.view_tier2'],
      ['amendNarrative', 'pastoral.log_concern'],
      ['listVersions', 'pastoral.view_tier1'],
      ['getEntityEvents', 'pastoral.view_tier2'],
      ['getCategories', 'pastoral.log_concern'],
      ['getStudentChronology', 'pastoral.view_tier1'],
    ] as Array<[keyof ConcernsController, string]>)(
      'should have @RequiresPermission("%s") on %s',
      (method, expectedPermission) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe(expectedPermission);
      },
    );

    it('should not have @RequiresPermission on shareConcernWithParent', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        controller.shareConcernWithParent,
      );
      expect(permission).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCERN SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should delegate to concernService.create with req.ip', async () => {
      const dto = {
        category: 'academic',
        student_id: STUDENT_ID,
        severity: 'routine' as const,
        narrative: 'Test narrative',
        occurred_at: '2026-01-15T10:00:00Z',
        follow_up_needed: false,
        author_masked: false,
        tier: 1 as const,
        location: 'Classroom A',
        witnesses: [],
        actions_taken: 'None',
      };
      const expected = { id: CONCERN_ID, ...dto };
      mockConcernService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT, USER, dto, MOCK_REQ as never);

      expect(mockConcernService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto, '127.0.0.1');
      expect(result).toBe(expected);
    });

    it('should pass null when req.ip is undefined', async () => {
      const dto = {
        category: 'academic',
        student_id: STUDENT_ID,
        severity: 'routine' as const,
        narrative: 'Test narrative',
        occurred_at: '2026-01-15T10:00:00Z',
        follow_up_needed: false,
        author_masked: false,
        tier: 1 as const,
        location: 'Classroom A',
        witnesses: [],
        actions_taken: 'None',
      };

      await controller.create(TENANT, USER, dto, {} as never);

      expect(mockConcernService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto, null);
    });
  });

  describe('list', () => {
    it('should fetch permissions then delegate to concernQueriesService.list', async () => {
      const query = { sort: 'created_at' as const, order: 'desc' as const, page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockPermissionCacheService.getPermissions.mockResolvedValue(MOCK_PERMISSIONS);
      mockConcernQueriesService.list.mockResolvedValue(expected);

      const result = await controller.list(TENANT, USER, query);

      expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(USER.membership_id);
      expect(mockConcernQueriesService.list).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        MOCK_PERMISSIONS,
        query,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getById', () => {
    it('should fetch permissions then delegate to concernService.getById with req.ip', async () => {
      const expected = { id: CONCERN_ID, narrative: 'Test' };
      mockPermissionCacheService.getPermissions.mockResolvedValue(MOCK_PERMISSIONS);
      mockConcernService.getById.mockResolvedValue(expected);

      const result = await controller.getById(TENANT, USER, CONCERN_ID, MOCK_REQ as never);

      expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(USER.membership_id);
      expect(mockConcernService.getById).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        MOCK_PERMISSIONS,
        CONCERN_ID,
        '127.0.0.1',
      );
      expect(result).toBe(expected);
    });

    it('should pass null ip when the request has no ip', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(MOCK_PERMISSIONS);
      mockConcernService.getById.mockResolvedValue({ id: CONCERN_ID });

      await controller.getById(TENANT, USER, CONCERN_ID, {} as never);

      expect(mockConcernService.getById).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        MOCK_PERMISSIONS,
        CONCERN_ID,
        null,
      );
    });
  });

  describe('updateMetadata', () => {
    it('should delegate to concernService.updateMetadata', async () => {
      const dto = { severity: 'elevated' as const };
      const expected = { id: CONCERN_ID, ...dto };
      mockConcernService.updateMetadata.mockResolvedValue(expected);

      const result = await controller.updateMetadata(TENANT, USER, CONCERN_ID, dto);

      expect(mockConcernService.updateMetadata).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('escalateTier', () => {
    it('should delegate to concernService.escalateTier with req.ip', async () => {
      const dto = { new_tier: 2, reason: 'Escalation reason' };
      const expected = { id: CONCERN_ID, tier: 2 };
      mockConcernService.escalateTier.mockResolvedValue(expected);

      const result = await controller.escalateTier(
        TENANT,
        USER,
        CONCERN_ID,
        dto,
        MOCK_REQ as never,
      );

      expect(mockConcernService.escalateTier).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        dto,
        '127.0.0.1',
      );
      expect(result).toBe(expected);
    });

    it('should pass null when escalation request ip is unavailable', async () => {
      const dto = { new_tier: 2, reason: 'Escalation reason' };
      mockConcernService.escalateTier.mockResolvedValue({ id: CONCERN_ID, tier: 2 });

      await controller.escalateTier(TENANT, USER, CONCERN_ID, dto, {} as never);

      expect(mockConcernService.escalateTier).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        dto,
        null,
      );
    });
  });

  describe('shareConcernWithParent', () => {
    it('should delegate to concernService.shareConcernWithParent', async () => {
      const dto = { notify_parent: true };
      const expected = { id: CONCERN_ID, shared_with_parent: true };
      mockConcernService.shareConcernWithParent.mockResolvedValue(expected);

      const result = await controller.shareConcernWithParent(TENANT, USER, CONCERN_ID, dto);

      expect(mockConcernService.shareConcernWithParent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        USER.membership_id,
        CONCERN_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('unshareConcernFromParent', () => {
    it('should delegate to concernService.unshareConcernFromParent', async () => {
      const expected = { id: CONCERN_ID, shared_with_parent: false };
      mockConcernService.unshareConcernFromParent.mockResolvedValue(expected);

      const result = await controller.unshareConcernFromParent(TENANT, USER, CONCERN_ID);

      expect(mockConcernService.unshareConcernFromParent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSION SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('amendNarrative', () => {
    it('should delegate to versionService.amendNarrative with req.ip', async () => {
      const dto = {
        new_narrative: 'Updated narrative text',
        amendment_reason: 'Correction needed',
      };
      const expected = { id: CONCERN_ID, version: 2 };
      mockVersionService.amendNarrative.mockResolvedValue(expected);

      const result = await controller.amendNarrative(
        TENANT,
        USER,
        CONCERN_ID,
        dto,
        MOCK_REQ as never,
      );

      expect(mockVersionService.amendNarrative).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        dto,
        '127.0.0.1',
      );
      expect(result).toBe(expected);
    });

    it('should pass null when amendment request ip is unavailable', async () => {
      const dto = {
        new_narrative: 'Updated narrative text',
        amendment_reason: 'Correction needed',
      };
      mockVersionService.amendNarrative.mockResolvedValue({ id: CONCERN_ID, version: 2 });

      await controller.amendNarrative(TENANT, USER, CONCERN_ID, dto, {} as never);

      expect(mockVersionService.amendNarrative).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        dto,
        null,
      );
    });
  });

  describe('listVersions', () => {
    it('should delegate to versionService.listVersions', async () => {
      const expected = [{ version: 1, narrative: 'Original' }];
      mockVersionService.listVersions.mockResolvedValue(expected);

      const result = await controller.listVersions(TENANT, CONCERN_ID);

      expect(mockVersionService.listVersions).toHaveBeenCalledWith(TENANT_ID, CONCERN_ID);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getEntityEvents', () => {
    it('should delegate to eventService.getEntityHistory', async () => {
      const query = { sort: 'created_at' as const, order: 'desc' as const, page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockEventService.getEntityHistory.mockResolvedValue(expected);

      const result = await controller.getEntityEvents(TENANT, USER, CONCERN_ID, query);

      expect(mockEventService.getEntityHistory).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'concern',
        CONCERN_ID,
        1,
        20,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getCategories', () => {
    it('should delegate to concernQueriesService.getCategories', async () => {
      const expected = [{ id: '1', name: 'Bullying' }];
      mockConcernQueriesService.getCategories.mockResolvedValue(expected);

      const result = await controller.getCategories(TENANT);

      expect(mockConcernQueriesService.getCategories).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('getStudentChronology', () => {
    it('should delegate to eventService.getStudentChronology', async () => {
      const query = { sort: 'created_at' as const, order: 'desc' as const, page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockEventService.getStudentChronology.mockResolvedValue(expected);

      const result = await controller.getStudentChronology(TENANT, USER, STUDENT_ID, query);

      expect(mockEventService.getStudentChronology).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      );
      expect(result).toBe(expected);
    });
  });
});
