import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../../common/guards/platform-role.guard';

import { TenantModulesAdminController } from './tenant-modules-admin.controller';
import { TenantModulesAdminService } from './tenant-modules-admin.service';

const TENANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'owner@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = mockUser;
      return true;
    },
  };
}

function buildService() {
  return {
    getModulesView: jest.fn().mockResolvedValue({
      tenant_id: TENANT_ID,
      modules: [],
      completeness: { complete: true, missing: [] },
    }),
  };
}

describe('TenantModulesAdminController', () => {
  let controller: TenantModulesAdminController;
  let service: ReturnType<typeof buildService>;

  beforeEach(async () => {
    service = buildService();
    const module = await Test.createTestingModule({
      controllers: [TenantModulesAdminController],
      providers: [{ provide: TenantModulesAdminService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TenantModulesAdminController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates module view reads to the service', async () => {
    await controller.getModules(TENANT_ID);

    expect(service.getModulesView).toHaveBeenCalledWith(TENANT_ID);
  });
});

describe('TenantModulesAdminController — HTTP guards and validation', () => {
  let app: INestApplication;
  let service: ReturnType<typeof buildService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    service = buildService();
    const module = await Test.createTestingModule({
      controllers: [TenantModulesAdminController],
      providers: [{ provide: TenantModulesAdminService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue(platformGuard)
      .compile();

    const nestApp = module.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  it('returns module view data for platform users', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/modules`).expect(200);

    expect(service.getModulesView).toHaveBeenCalledWith(TENANT_ID);
  });

  it('returns 400 for invalid tenant ids', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get('/v1/admin/tenants/not-a-uuid/modules').expect(400);
  });

  it('returns 403 when the platform role guard rejects access', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_ACCESS_DENIED',
          message: 'Platform access required',
        });
      },
    });

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/modules`).expect(403);
  });
});
