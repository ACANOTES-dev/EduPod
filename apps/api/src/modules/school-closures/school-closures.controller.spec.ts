import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SchoolClosuresController } from './school-closures.controller';
import { SchoolClosuresService } from './school-closures.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const CLOSURE_ID = 'closure-uuid-1';
const YEAR_GROUP_ID = 'year-group-1';
const CLASS_ID = 'class-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'membership-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SchoolClosuresController', () => {
  let controller: SchoolClosuresController;
  let mockService: {
    create: jest.Mock;
    bulkCreate: jest.Mock;
    findAll: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      create: jest.fn(),
      bulkCreate: jest.fn(),
      findAll: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolClosuresController],
      providers: [{ provide: SchoolClosuresService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchoolClosuresController>(SchoolClosuresController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create tests ─────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a single closure with all scope', async () => {
      const dto = {
        closure_date: '2025-12-25',
        reason: 'Christmas',
        affects_scope: 'all' as const,
      };
      const expected = {
        id: CLOSURE_ID,
        ...dto,
        cancelled_sessions: 0,
        flagged_sessions: [],
      };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should create closure with year_group scope', async () => {
      const dto = {
        closure_date: '2025-12-25',
        reason: 'Year Group Event',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
      };
      const expected = {
        id: CLOSURE_ID,
        ...dto,
        cancelled_sessions: 5,
        flagged_sessions: [],
      };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should create closure with class scope', async () => {
      const dto = {
        closure_date: '2025-12-25',
        reason: 'Class Event',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
      };
      const expected = {
        id: CLOSURE_ID,
        ...dto,
        cancelled_sessions: 1,
        flagged_sessions: [],
      };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should handle closure creation with flagged sessions', async () => {
      const dto = {
        closure_date: '2025-12-25',
        reason: 'Holiday',
        affects_scope: 'all' as const,
      };
      const expected = {
        id: CLOSURE_ID,
        ...dto,
        cancelled_sessions: 3,
        flagged_sessions: [
          { id: 'session-1', class_id: 'class-1', session_date: new Date(), status: 'submitted' },
        ],
      };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(result.flagged_sessions).toHaveLength(1);
    });
  });

  // ─── bulkCreate tests ─────────────────────────────────────────────────────
  describe('bulkCreate', () => {
    it('should bulk create closures', async () => {
      const dto = {
        start_date: '2025-12-25',
        end_date: '2025-12-26',
        reason: 'Christmas Break',
        affects_scope: 'all' as const,
        skip_weekends: true,
      };
      const expected = {
        created: 2,
        closures: [{ id: 'c1' }, { id: 'c2' }],
        created_count: 2,
        skipped_count: 0,
        cancelled_sessions: 10,
        flagged_sessions: [],
      };
      mockService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should bulk create closures with year_group scope', async () => {
      const dto = {
        start_date: '2025-12-25',
        end_date: '2025-12-27',
        reason: 'Winter Break',
        affects_scope: 'year_group' as const,
        scope_entity_id: YEAR_GROUP_ID,
        skip_weekends: false,
      };
      const expected = {
        created: 3,
        closures: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
        created_count: 3,
        skipped_count: 0,
        cancelled_sessions: 15,
        flagged_sessions: [],
      };
      mockService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should bulk create closures with class scope', async () => {
      const dto = {
        start_date: '2025-12-25',
        end_date: '2025-12-25',
        reason: 'Single Day',
        affects_scope: 'class' as const,
        scope_entity_id: CLASS_ID,
        skip_weekends: true,
      };
      const expected = {
        created: 1,
        closures: [{ id: 'c1' }],
        created_count: 1,
        skipped_count: 0,
        cancelled_sessions: 5,
        flagged_sessions: [],
      };
      mockService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockService.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should handle bulk create with skipped closures', async () => {
      const dto = {
        start_date: '2025-12-25',
        end_date: '2025-12-28',
        reason: 'Extended Break',
        affects_scope: 'all' as const,
        skip_weekends: true,
      };
      const expected = {
        closures: [{ id: 'c1' }, { id: 'c2' }],
        created_count: 2,
        skipped_count: 1,
        cancelled_sessions: 8,
        flagged_sessions: [],
      };
      mockService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(result.skipped_count).toBe(1);
    });

    it('should handle bulk create with flagged sessions', async () => {
      const dto = {
        start_date: '2025-12-25',
        end_date: '2025-12-25',
        reason: 'Holiday',
        affects_scope: 'all' as const,
        skip_weekends: false,
      };
      const expected = {
        closures: [{ id: 'c1' }],
        created_count: 1,
        skipped_count: 0,
        cancelled_sessions: 2,
        flagged_sessions: [
          { id: 's1', class_id: 'class-1', session_date: new Date(), status: 'locked' },
        ],
      };
      mockService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(mockTenant, mockUser, dto);

      expect(result).toEqual(expected);
      expect(result.flagged_sessions).toHaveLength(1);
    });
  });

  // ─── findAll tests ──────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should list closures with default filters', async () => {
      const expected = {
        data: [],
        meta: { page: 1, pageSize: 50, total: 0 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 50,
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 50,
        start_date: undefined,
        end_date: undefined,
        affects_scope: undefined,
      });
    });

    it('should list closures with date range filters', async () => {
      const expected = {
        data: [{ id: CLOSURE_ID, reason: 'Holiday' }],
        meta: { page: 1, pageSize: 50, total: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 50,
        start_date: '2025-12-01',
        end_date: '2025-12-31',
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 50,
        start_date: '2025-12-01',
        end_date: '2025-12-31',
        affects_scope: undefined,
      });
    });

    it('should list closures with affects_scope filter', async () => {
      const expected = {
        data: [{ id: CLOSURE_ID, affects_scope: 'year_group', scope_entity_name: 'Year 1' }],
        meta: { page: 1, pageSize: 50, total: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 50,
        affects_scope: 'year_group',
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 50,
        start_date: undefined,
        end_date: undefined,
        affects_scope: 'year_group',
      });
    });

    it('should list closures with class scope filter', async () => {
      const expected = {
        data: [{ id: CLOSURE_ID, affects_scope: 'class', scope_entity_name: 'Class A' }],
        meta: { page: 1, pageSize: 50, total: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 50,
        affects_scope: 'class',
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 50,
        start_date: undefined,
        end_date: undefined,
        affects_scope: 'class',
      });
    });

    it('should list closures with all scope filter', async () => {
      const expected = {
        data: [{ id: CLOSURE_ID, affects_scope: 'all', scope_entity_name: null }],
        meta: { page: 1, pageSize: 50, total: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 50,
        affects_scope: 'all',
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 50,
        start_date: undefined,
        end_date: undefined,
        affects_scope: 'all',
      });
    });

    it('should list closures with pagination', async () => {
      const expected = {
        data: Array(10).fill({ id: CLOSURE_ID, reason: 'Holiday' }),
        meta: { page: 2, pageSize: 10, total: 25 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 2,
        pageSize: 10,
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 2,
        pageSize: 10,
        start_date: undefined,
        end_date: undefined,
        affects_scope: undefined,
      });
    });

    it('should list closures with all filters combined', async () => {
      const expected = {
        data: [{ id: CLOSURE_ID, reason: 'Special Event', scope_entity_name: 'Year 2' }],
        meta: { page: 1, pageSize: 25, total: 1 },
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockTenant, {
        page: 1,
        pageSize: 25,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        affects_scope: 'year_group',
      });

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 25,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        affects_scope: 'year_group',
      });
    });
  });

  // ─── remove tests ──────────────────────────────────────────────────────────
  describe('remove', () => {
    it('should delete a closure', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove(mockTenant, CLOSURE_ID);

      expect(mockService.remove).toHaveBeenCalledWith(TENANT_ID, CLOSURE_ID);
    });

    it('should delete a closure with different UUID format', async () => {
      const differentId = '12345678-1234-1234-1234-123456789abc';
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove(mockTenant, differentId);

      expect(mockService.remove).toHaveBeenCalledWith(TENANT_ID, differentId);
    });
  });
});
