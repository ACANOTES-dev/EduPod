import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenAccommodationController } from './sen-accommodation.controller';
import { SenAccommodationService } from './sen-accommodation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACCOMMODATION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('SenAccommodationController', () => {
  let controller: SenAccommodationController;

  const mockService = {
    create: jest.fn(),
    findAllByProfile: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getExamReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenAccommodationController],
      providers: [{ provide: SenAccommodationService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SenAccommodationController>(SenAccommodationController);

    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guards and Decorators ───────────────────────────────────────────────

  describe('Controller Guards and Decorators', () => {
    it('should have @ModuleEnabled("sen") on the controller class', () => {
      const metadata = Reflect.getMetadata(MODULE_ENABLED_KEY, SenAccommodationController);
      expect(metadata).toBe('sen');
    });

    it('should have guards applied on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', SenAccommodationController);
      expect(guards).toBeDefined();
      expect(guards.length).toBe(3);
    });
  });

  // ─── getExamReport ───────────────────────────────────────────────────────

  describe('getExamReport', () => {
    it('should delegate to service.getExamReport', async () => {
      const query = { year_group_id: PROFILE_ID };
      const mockResult = [{ year_group: { id: PROFILE_ID, name: 'First Year' }, students: [] }];
      mockService.getExamReport.mockResolvedValue(mockResult);

      const result = await controller.getExamReport(TENANT, query);

      expect(result).toEqual(mockResult);
      expect(mockService.getExamReport).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('should require sen.admin permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenAccommodationController.prototype.getExamReport,
      );
      expect(metadata).toBe('sen.admin');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to service.create with profileId from route param', async () => {
      const dto = {
        accommodation_type: 'exam' as const,
        description: 'Extra time for written exams',
        details: { percentage: 25 },
        is_active: true,
      };
      const mockResult = { id: ACCOMMODATION_ID };
      mockService.create.mockResolvedValue(mockResult);

      const result = await controller.create(TENANT, PROFILE_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenAccommodationController.prototype.create,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── findAllByProfile ────────────────────────────────────────────────────

  describe('findAllByProfile', () => {
    it('should delegate to service.findAllByProfile', async () => {
      const query = { page: 1, pageSize: 20 };
      const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.findAllByProfile.mockResolvedValue(mockResult);

      const result = await controller.findAllByProfile(TENANT, PROFILE_ID, query);

      expect(result).toEqual(mockResult);
      expect(mockService.findAllByProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, query);
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenAccommodationController.prototype.findAllByProfile,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const dto = { description: 'Updated description' };
      const mockResult = { id: ACCOMMODATION_ID };
      mockService.update.mockResolvedValue(mockResult);

      const result = await controller.update(TENANT, ACCOMMODATION_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, ACCOMMODATION_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenAccommodationController.prototype.update,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delegate to service.delete', async () => {
      mockService.delete.mockResolvedValue(undefined);

      await controller.delete(TENANT, ACCOMMODATION_ID);

      expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, ACCOMMODATION_ID);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenAccommodationController.prototype.delete,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── Route ordering ──────────────────────────────────────────────────────

  describe('route ordering', () => {
    it('should declare getExamReport before update and delete', () => {
      const methodNames = Object.getOwnPropertyNames(SenAccommodationController.prototype);

      expect(methodNames.indexOf('getExamReport')).toBeLessThan(methodNames.indexOf('update'));
      expect(methodNames.indexOf('getExamReport')).toBeLessThan(methodNames.indexOf('delete'));
    });
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenAccommodationController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenAccommodationController],
      providers: [
        { provide: SenAccommodationService, useValue: {} },
        { provide: PermissionCacheService, useValue: { getPermissions: jest.fn() } },
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

  it('should return 403 when user lacks sen.manage permission (POST /v1/sen/profiles/:profileId/accommodations)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/sen/profiles/${PROFILE_ID}/accommodations`)
      .send({
        accommodation_type: 'exam',
        description: 'Extra time',
      })
      .expect(403);
  });

  it('should return 403 when user lacks sen.admin permission (GET /v1/sen/accommodations/exam-report)', async () => {
    await request(app.getHttpServer()).get('/v1/sen/accommodations/exam-report').expect(403);
  });
});
