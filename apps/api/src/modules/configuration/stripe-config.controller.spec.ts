import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { StripeConfigController } from './stripe-config.controller';
import { StripeConfigService } from './stripe-config.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';

const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const userCtx: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('StripeConfigController', () => {
  let controller: StripeConfigController;
  let mockService: {
    getConfig: jest.Mock;
    upsertConfig: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getConfig: jest.fn(),
      upsertConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeConfigController],
      providers: [
        { provide: StripeConfigService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StripeConfigController>(StripeConfigController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call stripeConfigService.getConfig with tenant_id', async () => {
    const expected = {
      id: 'c1',
      stripe_secret_key_masked: '****1234',
      stripe_publishable_key: 'pk_test_abc',
    };
    mockService.getConfig.mockResolvedValue(expected);

    const result = await controller.getConfig(tenantCtx);

    expect(mockService.getConfig).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(expected);
  });

  it('should call stripeConfigService.upsertConfig with tenant_id, user_id, and dto', async () => {
    const dto = {
      stripe_secret_key: 'sk_test_new',
      stripe_publishable_key: 'pk_test_new',
      stripe_webhook_secret: 'whsec_new',
    };
    const expected = { id: 'c1', stripe_secret_key_masked: '****_new' };
    mockService.upsertConfig.mockResolvedValue(expected);

    const result = await controller.upsertConfig(tenantCtx, userCtx, dto);

    expect(mockService.upsertConfig).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual(expected);
  });

  it('should propagate service errors', async () => {
    mockService.getConfig.mockRejectedValue(new Error('Not found'));

    await expect(controller.getConfig(tenantCtx)).rejects.toThrow('Not found');
  });
});
