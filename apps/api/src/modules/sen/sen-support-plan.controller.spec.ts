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

import { SenSupportPlanController } from './sen-support-plan.controller';
import { SenSupportPlanService } from './sen-support-plan.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MEMBERSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('SenSupportPlanController', () => {
  let controller: SenSupportPlanController;

  const mockService = {
    create: jest.fn(),
    findAllByProfile: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    clone: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenSupportPlanController],
      providers: [
        { provide: SenSupportPlanService, useValue: mockService },
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

    controller = module.get<SenSupportPlanController>(SenSupportPlanController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view', 'sen.manage']);
  });

  afterEach(() => jest.clearAllMocks());

  const user: JwtPayload = {
    sub: USER_ID,
    email: 'test@test.com',
    tenant_id: TENANT_ID,
    membership_id: MEMBERSHIP_ID,
    type: 'access',
    iat: 0,
    exp: 0,
  };

  it('has module-enabled metadata', () => {
    expect(Reflect.getMetadata(MODULE_ENABLED_KEY, SenSupportPlanController)).toBe('sen');
  });

  it('delegates create', async () => {
    mockService.create.mockResolvedValue({ id: PLAN_ID });

    const result = await controller.create(TENANT, user, PROFILE_ID, {
      academic_year_id: 'year-id',
    });

    expect(result).toEqual({ id: PLAN_ID });
    expect(mockService.create).toHaveBeenCalledWith(
      TENANT_ID,
      PROFILE_ID,
      { academic_year_id: 'year-id' },
      USER_ID,
    );
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenSupportPlanController.prototype.create),
    ).toBe('sen.manage');
  });

  it('delegates findAllByProfile with cached permissions', async () => {
    mockService.findAllByProfile.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllByProfile(TENANT, user, PROFILE_ID, { page: 1, pageSize: 20 });

    expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockService.findAllByProfile).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      PROFILE_ID,
      { page: 1, pageSize: 20 },
    );
  });

  it('delegates findOne with cached permissions', async () => {
    mockService.findOne.mockResolvedValue({ id: PLAN_ID });

    await controller.findOne(TENANT, user, PLAN_ID);

    expect(mockService.findOne).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      PLAN_ID,
    );
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenSupportPlanController.prototype.findOne),
    ).toBe('sen.view');
  });

  it('delegates update, transitionStatus, and clone', async () => {
    mockService.update.mockResolvedValue({ id: PLAN_ID });
    mockService.transitionStatus.mockResolvedValue({ id: PLAN_ID, status: 'active' });
    mockService.clone.mockResolvedValue({ id: 'new-plan' });

    await controller.update(TENANT, PLAN_ID, { staff_notes: 'Updated' });
    await controller.transitionStatus(TENANT, user, PLAN_ID, { status: 'active' });
    await controller.clone(TENANT, user, PLAN_ID, { academic_year_id: 'next-year' });

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, PLAN_ID, { staff_notes: 'Updated' });
    expect(mockService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      PLAN_ID,
      { status: 'active' },
      USER_ID,
    );
    expect(mockService.clone).toHaveBeenCalledWith(
      TENANT_ID,
      PLAN_ID,
      { academic_year_id: 'next-year' },
      USER_ID,
    );
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenSupportPlanController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenSupportPlanController],
      providers: [
        { provide: SenSupportPlanService, useValue: {} },
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

  it('should return 403 when user lacks sen.manage permission (POST /v1/sen/profiles/:profileId/plans)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/sen/profiles/${PROFILE_ID}/plans`)
      .send({ academic_year_id: 'year-id' })
      .expect(403);
  });
});
