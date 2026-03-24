import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { PublicWebsiteController } from './public-website.controller';
import { PublicWebsiteService } from './public-website.service';

const TENANT_ID = 'tenant-uuid-1';

const tenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('PublicWebsiteController', () => {
  let controller: PublicWebsiteController;
  let mockService: {
    getPublishedPages: jest.Mock;
    getPageBySlug: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getPublishedPages: jest.fn(),
      getPageBySlug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicWebsiteController],
      providers: [{ provide: PublicWebsiteService, useValue: mockService }],
    }).compile();

    controller = module.get<PublicWebsiteController>(PublicWebsiteController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate listPublished to the service with default locale', async () => {
    const pages = [{ id: 'p1', slug: 'home', title: 'Home' }];
    mockService.getPublishedPages.mockResolvedValueOnce(pages);

    const result = await controller.listPublished(tenant, 'en');
    expect(result).toEqual(pages);
    expect(mockService.getPublishedPages).toHaveBeenCalledWith(TENANT_ID, 'en');
  });

  it('should delegate listPublished with Arabic locale', async () => {
    mockService.getPublishedPages.mockResolvedValueOnce([]);

    const result = await controller.listPublished(tenant, 'ar');
    expect(result).toEqual([]);
    expect(mockService.getPublishedPages).toHaveBeenCalledWith(TENANT_ID, 'ar');
  });

  it('should delegate getBySlug to the service', async () => {
    const page = { id: 'p1', slug: 'about-us', title: 'About Us' };
    mockService.getPageBySlug.mockResolvedValueOnce(page);

    const result = await controller.getBySlug(tenant, 'about-us', 'en');
    expect(result).toEqual(page);
    expect(mockService.getPageBySlug).toHaveBeenCalledWith(TENANT_ID, 'about-us', 'en');
  });

  it('should propagate service errors to the caller', async () => {
    mockService.getPageBySlug.mockRejectedValueOnce(new Error('Not Found'));

    await expect(
      controller.getBySlug(tenant, 'missing', 'en'),
    ).rejects.toThrow('Not Found');
  });
});
