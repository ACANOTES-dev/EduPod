import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';
import request from 'supertest';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenResourceController } from './sen-resource.controller';
import { SenResourceService } from './sen-resource.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RESOURCE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const HOURS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SenResourceController', () => {
  let controller: SenResourceController;

  const mockService = {
    createAllocation: jest.fn(),
    findAllAllocations: jest.fn(),
    updateAllocation: jest.fn(),
    assignStudentHours: jest.fn(),
    findStudentHours: jest.fn(),
    updateStudentHours: jest.fn(),
    getUtilisation: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage_resources']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenResourceController],
      providers: [
        { provide: SenResourceService, useValue: mockService },
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

    controller = module.get<SenResourceController>(SenResourceController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue([
      'sen.view',
      'sen.manage_resources',
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Controller Guards and Decorators', () => {
    it('should have @ModuleEnabled("sen") on the controller class', () => {
      const metadata = Reflect.getMetadata(MODULE_ENABLED_KEY, SenResourceController);
      expect(metadata).toBe('sen');
    });

    it('should have guards applied on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', SenResourceController);
      expect(guards).toBeDefined();
      expect(guards.length).toBe(3);
    });
  });

  describe('createAllocation', () => {
    it('should delegate to service.createAllocation', async () => {
      const dto = {
        academic_year_id: RESOURCE_ID,
        total_hours: 20,
        source: 'seno' as const,
        notes: 'Initial allocation',
      };
      const mockResult = { id: RESOURCE_ID };
      mockService.createAllocation.mockResolvedValue(mockResult);

      const result = await controller.createAllocation(TENANT, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.createAllocation).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.createAllocation,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('findAllAllocations', () => {
    it('should delegate to service.findAllAllocations', async () => {
      const query = { page: 1, pageSize: 20, academic_year_id: RESOURCE_ID };
      const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.findAllAllocations.mockResolvedValue(mockResult);

      const result = await controller.findAllAllocations(TENANT, query);

      expect(result).toEqual(mockResult);
      expect(mockService.findAllAllocations).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.findAllAllocations,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  describe('updateAllocation', () => {
    it('should delegate to service.updateAllocation', async () => {
      const dto = { total_hours: 18 };
      const mockResult = { id: RESOURCE_ID };
      mockService.updateAllocation.mockResolvedValue(mockResult);

      const result = await controller.updateAllocation(TENANT, RESOURCE_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.updateAllocation).toHaveBeenCalledWith(TENANT_ID, RESOURCE_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.updateAllocation,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('assignStudentHours', () => {
    it('should delegate to service.assignStudentHours', async () => {
      const dto = {
        resource_allocation_id: RESOURCE_ID,
        student_id: USER_ID,
        sen_profile_id: HOURS_ID,
        allocated_hours: 6,
      };
      const mockResult = { id: HOURS_ID };
      mockService.assignStudentHours.mockResolvedValue(mockResult);

      const result = await controller.assignStudentHours(TENANT, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.assignStudentHours).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.assignStudentHours,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('findStudentHours', () => {
    it('should delegate to service.findStudentHours with cached permissions', async () => {
      const query = { student_id: USER_ID };
      const mockResult = [{ id: HOURS_ID }];
      mockService.findStudentHours.mockResolvedValue(mockResult);

      const result = await controller.findStudentHours(TENANT, USER, query);

      expect(result).toEqual(mockResult);
      expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockService.findStudentHours).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage_resources'],
        query,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.findStudentHours,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  describe('updateStudentHours', () => {
    it('should delegate to service.updateStudentHours', async () => {
      const dto = { allocated_hours: 8, used_hours: 4 };
      const mockResult = { id: HOURS_ID };
      mockService.updateStudentHours.mockResolvedValue(mockResult);

      const result = await controller.updateStudentHours(TENANT, HOURS_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.updateStudentHours).toHaveBeenCalledWith(TENANT_ID, HOURS_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.updateStudentHours,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('getUtilisation', () => {
    it('should delegate to service.getUtilisation', async () => {
      const query = { academic_year_id: RESOURCE_ID };
      const mockResult = { totals: { total_allocated_hours: 20 } };
      mockService.getUtilisation.mockResolvedValue(mockResult);

      const result = await controller.getUtilisation(TENANT, query);

      expect(result).toEqual(mockResult);
      expect(mockService.getUtilisation).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenResourceController.prototype.getUtilisation,
      );
      expect(metadata).toBe('sen.view');
    });
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenResourceController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenResourceController],
      providers: [
        { provide: SenResourceService, useValue: {} },
        {
          provide: PermissionCacheService,
          useValue: { getPermissions: jest.fn().mockResolvedValue([]) },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks sen.manage_resources permission (POST /v1/sen/resource-allocations)', async () => {
    await request(app.getHttpServer())
      .post('/v1/sen/resource-allocations')
      .send({ academic_year_id: RESOURCE_ID, total_hours: 20, source: 'seno' })
      .expect(403);
  });
});
