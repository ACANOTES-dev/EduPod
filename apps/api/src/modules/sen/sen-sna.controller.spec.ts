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

import { SenSnaController } from './sen-sna.controller';
import { SenSnaService } from './sen-sna.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ASSIGNMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

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

describe('SenSnaController', () => {
  let controller: SenSnaController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    endAssignment: jest.fn(),
    findBySna: jest.fn(),
    findByStudent: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage_resources']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenSnaController],
      providers: [
        { provide: SenSnaService, useValue: mockService },
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

    controller = module.get<SenSnaController>(SenSnaController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue([
      'sen.view',
      'sen.manage_resources',
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Controller Guards and Decorators', () => {
    it('should have @ModuleEnabled("sen") on the controller class', () => {
      const metadata = Reflect.getMetadata(MODULE_ENABLED_KEY, SenSnaController);
      expect(metadata).toBe('sen');
    });

    it('should have guards applied on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', SenSnaController);
      expect(guards).toBeDefined();
      expect(guards.length).toBe(3);
    });
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const dto = {
        sna_staff_profile_id: STAFF_ID,
        student_id: STUDENT_ID,
        sen_profile_id: ASSIGNMENT_ID,
        schedule: { monday: [{ start: '09:00', end: '11:00' }] },
        start_date: '2026-04-01',
      };
      const mockResult = { id: ASSIGNMENT_ID };
      mockService.create.mockResolvedValue(mockResult);

      const result = await controller.create(TENANT, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.create,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with cached permissions', async () => {
      const query = { page: 1, pageSize: 20 };
      const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(TENANT, USER, query);

      expect(result).toEqual(mockResult);
      expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockService.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage_resources'],
        query,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.findAll,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  describe('findBySna', () => {
    it('should delegate to service.findBySna', async () => {
      const mockResult = [{ id: ASSIGNMENT_ID }];
      mockService.findBySna.mockResolvedValue(mockResult);

      const result = await controller.findBySna(TENANT, USER, STAFF_ID);

      expect(result).toEqual(mockResult);
      expect(mockService.findBySna).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage_resources'],
        STAFF_ID,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.findBySna,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  describe('findByStudent', () => {
    it('should delegate to service.findByStudent', async () => {
      const mockResult = [{ id: ASSIGNMENT_ID }];
      mockService.findByStudent.mockResolvedValue(mockResult);

      const result = await controller.findByStudent(TENANT, USER, STUDENT_ID);

      expect(result).toEqual(mockResult);
      expect(mockService.findByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.manage_resources'],
        STUDENT_ID,
      );
    });

    it('should require sen.view permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.findByStudent,
      );
      expect(metadata).toBe('sen.view');
    });
  });

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const dto = {
        notes: 'Adjusted support',
        status: 'active' as const,
      };
      const mockResult = { id: ASSIGNMENT_ID };
      mockService.update.mockResolvedValue(mockResult);

      const result = await controller.update(TENANT, ASSIGNMENT_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, ASSIGNMENT_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.update,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('endAssignment', () => {
    it('should delegate to service.endAssignment', async () => {
      const dto = { end_date: '2026-06-30' };
      const mockResult = { id: ASSIGNMENT_ID };
      mockService.endAssignment.mockResolvedValue(mockResult);

      const result = await controller.endAssignment(TENANT, ASSIGNMENT_ID, dto);

      expect(result).toEqual(mockResult);
      expect(mockService.endAssignment).toHaveBeenCalledWith(TENANT_ID, ASSIGNMENT_ID, dto);
    });

    it('should require sen.manage_resources permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenSnaController.prototype.endAssignment,
      );
      expect(metadata).toBe('sen.manage_resources');
    });
  });

  describe('route ordering', () => {
    it('should declare static by-sna and by-student handlers before update', () => {
      const methodNames = Object.getOwnPropertyNames(SenSnaController.prototype);

      expect(methodNames.indexOf('findBySna')).toBeLessThan(methodNames.indexOf('update'));
      expect(methodNames.indexOf('findByStudent')).toBeLessThan(methodNames.indexOf('update'));
    });
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenSnaController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenSnaController],
      providers: [
        { provide: SenSnaService, useValue: {} },
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

  it('should return 403 when user lacks sen.manage_resources permission (POST /v1/sen/sna-assignments)', async () => {
    await request(app.getHttpServer())
      .post('/v1/sen/sna-assignments')
      .send({
        sna_staff_profile_id: STAFF_ID,
        student_id: STUDENT_ID,
        sen_profile_id: ASSIGNMENT_ID,
        schedule: { monday: [{ start: '09:00', end: '11:00' }] },
        start_date: '2026-04-01',
      })
      .expect(403);
  });
});
