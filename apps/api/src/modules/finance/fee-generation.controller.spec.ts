import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { FeeGenerationController } from './fee-generation.controller';
import { FeeGenerationService } from './fee-generation.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockService = {
  preview: jest.fn(),
  confirm: jest.fn(),
};

describe('FeeGenerationController', () => {
  let controller: FeeGenerationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeeGenerationController],
      providers: [{ provide: FeeGenerationService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<FeeGenerationController>(FeeGenerationController);
    jest.clearAllMocks();
  });

  it('should call service.preview with tenant and dto', async () => {
    const dto = { billing_period: '2025-01' } as never;
    mockService.preview.mockResolvedValue({ total: 100, items: [] });
    await controller.preview(TENANT, dto);
    expect(mockService.preview).toHaveBeenCalledWith('tenant-uuid', dto);
  });

  it('should call service.confirm with tenant, user.sub and dto', async () => {
    const dto = { billing_period: '2025-01' } as never;
    mockService.confirm.mockResolvedValue({ created: 10 });
    await controller.confirm(TENANT, USER, dto);
    expect(mockService.confirm).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  it('should return the result from service.preview', async () => {
    const expected = { total: 5, items: [{ id: '1' }] };
    mockService.preview.mockResolvedValue(expected);
    const result = await controller.preview(TENANT, {} as never);
    expect(result).toEqual(expected);
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('FeeGenerationController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FeeGenerationController],
      providers: [{ provide: FeeGenerationService, useValue: mockService }],
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

  it('should return 403 when user lacks finance.manage permission (POST /v1/finance/fee-generation/preview)', async () => {
    await request(app.getHttpServer())
      .post('/v1/finance/fee-generation/preview')
      .send({})
      .expect(403);
  });
});
