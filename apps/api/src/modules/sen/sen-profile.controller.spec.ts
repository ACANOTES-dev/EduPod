import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenProfileController } from './sen-profile.controller';
import { SenProfileService } from './sen-profile.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MEMBERSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROFILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('SenProfileController', () => {
  let controller: SenProfileController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByStudent: jest.fn(),
    update: jest.fn(),
    getOverview: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenProfileController],
      providers: [
        { provide: SenProfileService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SenProfileController>(SenProfileController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view', 'sen.manage']);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Controller Guards and Decorators ─────────────────────────────────────────

  describe('Controller Guards and Decorators', () => {
    it('should have @ModuleEnabled("sen") on the controller class', () => {
      const metadata = Reflect.getMetadata(MODULE_ENABLED_KEY, SenProfileController);
      expect(metadata).toBe('sen');
    });

    it('should have guards applied on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', SenProfileController);
      expect(guards).toBeDefined();
      expect(guards.length).toBe(3);
    });
  });

  // ─── getOverview ──────────────────────────────────────────────────────────────

  describe('getOverview', () => {
    it('should delegate to service.getOverview', async () => {
      const mockOverview = {
        totalSenStudents: 10,
        byCategory: { learning: 5 },
        bySupportLevel: { school_support: 7 },
        byYearGroup: [],
      };
      mockService.getOverview.mockResolvedValue(mockOverview);

      const tenant = TENANT;
      const result = await controller.getOverview(tenant);

      expect(result).toEqual(mockOverview);
      expect(mockService.getOverview).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.getOverview,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── findByStudent ────────────────────────────────────────────────────────────

  describe('findByStudent', () => {
    it('should delegate to service.findByStudent', async () => {
      const mockProfile = { id: PROFILE_ID, student_id: STUDENT_ID };
      mockService.findByStudent.mockResolvedValue(mockProfile);

      const tenant = TENANT;
      const user: JwtPayload = {
        sub: USER_ID,
        email: 'test@test.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        type: 'access',
        iat: 0,
        exp: 0,
      };
      const result = await controller.findByStudent(tenant, user, STUDENT_ID);

      expect(result).toEqual(mockProfile);
      expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockService.findByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage'],
        STUDENT_ID,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.findByStudent,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const mockProfile = { id: PROFILE_ID };
      mockService.create.mockResolvedValue(mockProfile);

      const tenant = TENANT;
      const dto = {
        student_id: STUDENT_ID,
        sen_categories: ['learning'] as 'learning'[],
        primary_category: 'learning' as const,
        support_level: 'school_support' as const,
        is_active: true,
      };

      const result = await controller.create(tenant, dto);

      expect(result).toEqual(mockProfile);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.create,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      const mockResult = {
        data: [{ id: PROFILE_ID }],
        meta: { page: 1, pageSize: 20, total: 1 },
      };
      mockService.findAll.mockResolvedValue(mockResult);

      const tenant = TENANT;
      const user: JwtPayload = {
        sub: USER_ID,
        email: 'test@test.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        type: 'access',
        iat: 0,
        exp: 0,
      };
      const query = { page: 1, pageSize: 20 };

      const result = await controller.findAll(tenant, user, query);

      expect(result).toEqual(mockResult);
      expect(mockService.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage'],
        query,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.findAll,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should delegate to service.findOne', async () => {
      const mockProfile = { id: PROFILE_ID };
      mockService.findOne.mockResolvedValue(mockProfile);

      const tenant = TENANT;
      const user: JwtPayload = {
        sub: USER_ID,
        email: 'test@test.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        type: 'access',
        iat: 0,
        exp: 0,
      };
      const result = await controller.findOne(tenant, user, PROFILE_ID);

      expect(result).toEqual(mockProfile);
      expect(mockService.findOne).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage'],
        PROFILE_ID,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.findOne,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const mockProfile = { id: PROFILE_ID, support_level: 'school_support_plus' };
      mockService.update.mockResolvedValue(mockProfile);

      const tenant = TENANT;
      const dto = { support_level: 'school_support_plus' as const };
      const result = await controller.update(tenant, PROFILE_ID, dto);

      expect(result).toEqual(mockProfile);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfileController.prototype.update,
      );
      expect(metadata).toBe('sen.manage');
    });
  });
});
