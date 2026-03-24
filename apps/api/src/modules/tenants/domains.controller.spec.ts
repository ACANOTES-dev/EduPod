import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';


import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { PlatformOwnerGuard } from './guards/platform-owner.guard';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DOMAIN_ID = '11111111-2222-3333-4444-555555555555';

const alwaysAllowGuard = { canActivate: () => true };

describe('DomainsController', () => {
  let controller: DomainsController;
  let mockService: {
    listDomains: jest.Mock;
    addDomain: jest.Mock;
    updateDomain: jest.Mock;
    removeDomain: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listDomains: jest.fn(),
      addDomain: jest.fn(),
      updateDomain: jest.fn(),
      removeDomain: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainsController],
      providers: [{ provide: DomainsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PlatformOwnerGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get<DomainsController>(DomainsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate listDomains to the service', async () => {
    const domains = [{ id: DOMAIN_ID, domain: 'test.com' }];
    mockService.listDomains.mockResolvedValueOnce(domains);

    const result = await controller.listDomains(TENANT_ID);
    expect(result).toEqual(domains);
    expect(mockService.listDomains).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate addDomain to the service', async () => {
    const dto = { domain: 'new.com', domain_type: 'app' as const, is_primary: false };
    const created = { id: DOMAIN_ID, ...dto };
    mockService.addDomain.mockResolvedValueOnce(created);

    const result = await controller.addDomain(TENANT_ID, dto);
    expect(result).toEqual(created);
    expect(mockService.addDomain).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should delegate updateDomain to the service', async () => {
    const dto = { is_primary: true };
    const updated = { id: DOMAIN_ID, is_primary: true };
    mockService.updateDomain.mockResolvedValueOnce(updated);

    const result = await controller.updateDomain(TENANT_ID, DOMAIN_ID, dto);
    expect(result).toEqual(updated);
    expect(mockService.updateDomain).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID, dto);
  });

  it('should delegate removeDomain to the service', async () => {
    mockService.removeDomain.mockResolvedValueOnce({ deleted: true });

    const result = await controller.removeDomain(TENANT_ID, DOMAIN_ID);
    expect(result).toEqual({ deleted: true });
    expect(mockService.removeDomain).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID);
  });
});
