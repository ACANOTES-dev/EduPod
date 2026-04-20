import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { AiFlagsController } from './ai-flags.controller';
import { AiFlagsService } from './ai-flags.service';
import { AiFlagGuard } from './decorators/ai-flag.guard';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const user: JwtPayload = {
  sub: USER_ID,
  email: 'principal@example.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('AiFlagsController', () => {
  let controller: AiFlagsController;
  let mockService: { list: jest.Mock; setFlag: jest.Mock };

  beforeEach(async () => {
    mockService = { list: jest.fn(), setFlag: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiFlagsController],
      providers: [{ provide: AiFlagsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AiFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AiFlagsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('list — delegates to service with tenant_id', async () => {
    mockService.list.mockResolvedValue([]);
    await controller.list(tenantCtx);
    expect(mockService.list).toHaveBeenCalledWith(TENANT_ID);
  });

  it('setFlag — passes module key, enabled flag, and acting user id', async () => {
    mockService.setFlag.mockResolvedValue({});
    await controller.setFlag(tenantCtx, user, 'behaviour', { enabled: true });
    expect(mockService.setFlag).toHaveBeenCalledWith(TENANT_ID, 'behaviour', true, USER_ID);
  });
});

describe('AiFlagsController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiFlagsController],
      providers: [{ provide: AiFlagsService, useValue: {} }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .overrideGuard(AiFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 403 when user lacks ai_flag.manage', async () => {
    await request(app.getHttpServer()).get('/v1/ai-flags').expect(403);
  });
});
