import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenProfessionalController } from './sen-professional.controller';
import { SenProfessionalService } from './sen-professional.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INVOLVEMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const MEMBERSHIP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: '00000000-0000-0000-0000-000000000099',
  email: 'test@school.ie',
  membership_id: MEMBERSHIP_ID,
  tenant_id: TENANT_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SenProfessionalController', () => {
  let controller: SenProfessionalController;

  const mockService = {
    create: jest.fn(),
    findAllByProfile: jest.fn(),
    countByProfile: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenProfessionalController],
      providers: [
        { provide: SenProfessionalService, useValue: mockService },
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

    controller = module.get<SenProfessionalController>(SenProfessionalController);

    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Class-level decorators ────────────────────────────────────────────────

  describe('Controller Guards and Decorators', () => {
    it('should have @ModuleEnabled("sen") on the controller class', () => {
      const metadata = Reflect.getMetadata(MODULE_ENABLED_KEY, SenProfessionalController);
      expect(metadata).toBe('sen');
    });

    it('should have guards applied on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', SenProfessionalController);
      expect(guards).toBeDefined();
      expect(guards.length).toBe(3);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to service.create with profileId from route', async () => {
      const dto = {
        professional_type: 'educational_psychologist' as const,
        professional_name: 'Dr. Smith',
        organisation: 'NEPS',
        status: 'pending' as const,
      };
      const mockResult = { id: INVOLVEMENT_ID };
      mockService.create.mockResolvedValue(mockResult);

      const result = await controller.create(TENANT, PROFILE_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfessionalController.prototype.create,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── findAllByProfile ─────────────────────────────────────────────────────

  describe('findAllByProfile', () => {
    it('should return full data when user has sen.view_sensitive', async () => {
      const query = { page: 1, pageSize: 20 };
      const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockPermissionCacheService.getPermissions.mockResolvedValue([
        'sen.view',
        'sen.view_sensitive',
      ]);
      mockService.findAllByProfile.mockResolvedValue(mockResult);

      const result = await controller.findAllByProfile(TENANT, USER, PROFILE_ID, query);

      expect(result).toEqual(mockResult);
      expect(mockService.findAllByProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, query);
      expect(mockService.countByProfile).not.toHaveBeenCalled();
    });

    it('should return count only when user lacks sen.view_sensitive', async () => {
      const query = { page: 1, pageSize: 20 };
      mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view']);
      mockService.countByProfile.mockResolvedValue({ total: 5 });

      const result = await controller.findAllByProfile(TENANT, USER, PROFILE_ID, query);

      expect(result).toEqual({ total: 5 });
      expect(mockService.countByProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID);
      expect(mockService.findAllByProfile).not.toHaveBeenCalled();
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfessionalController.prototype.findAllByProfile,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const dto = { status: 'completed' as const };
      const mockResult = { id: INVOLVEMENT_ID };
      mockService.update.mockResolvedValue(mockResult);

      const result = await controller.update(TENANT, INVOLVEMENT_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, INVOLVEMENT_ID, dto);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfessionalController.prototype.update,
      );
      expect(metadata).toBe('sen.manage');
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delegate to service.delete', async () => {
      mockService.delete.mockResolvedValue(undefined);

      await controller.delete(TENANT, INVOLVEMENT_ID);

      expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, INVOLVEMENT_ID);
    });

    it('should require sen.manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenProfessionalController.prototype.delete,
      );
      expect(metadata).toBe('sen.manage');
    });
  });
});

// ─── Permission denied (guard rejection via HTTP) ────────────────────────────

describe('SenProfessionalController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenProfessionalController],
      providers: [
        { provide: SenProfessionalService, useValue: {} },
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

  it('should return 403 when user lacks sen.manage permission (POST)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/sen/profiles/${PROFILE_ID}/professionals`)
      .send({ professional_type: 'educational_psychologist' })
      .expect(403);
  });

  it('should return 403 when user lacks sen.view permission (GET)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/sen/profiles/${PROFILE_ID}/professionals`)
      .expect(403);
  });

  it('should return 403 when user lacks sen.manage permission (DELETE)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/sen/professionals/${INVOLVEMENT_ID}`)
      .expect(403);
  });
});
