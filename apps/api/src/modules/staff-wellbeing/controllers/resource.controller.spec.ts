import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { ResourceService } from '../services/resource.service';

import { ResourceController } from './resource.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const MOCK_RESULT = {
  eap: {
    provider_name: 'Acme EAP',
    phone: '+353-1-234-5678',
    website: 'https://eap.example.com',
    hours: '24/7',
    management_body: 'HSE',
    last_verified_date: '2025-01-15',
  },
  resources: [{ name: 'Samaritans', phone: '116 123', website: 'https://samaritans.org' }],
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ResourceController', () => {
  let controller: ResourceController;
  let mockResourceService: { getResources: jest.Mock };

  beforeEach(async () => {
    mockResourceService = { getResources: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceController],
      providers: [{ provide: ResourceService, useValue: mockResourceService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ResourceController>(ResourceController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call service.getResources with tenant_id', async () => {
    mockResourceService.getResources.mockResolvedValue(MOCK_RESULT);

    await controller.getResources(TENANT);

    expect(mockResourceService.getResources).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should return the service result', async () => {
    mockResourceService.getResources.mockResolvedValue(MOCK_RESULT);

    const result = await controller.getResources(TENANT);

    expect(result).toEqual(MOCK_RESULT);
  });
});
