import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext, JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { WebsitePagesController } from './website-pages.controller';
import { WebsitePagesService } from './website-pages.service';

const TENANT_ID = 'tenant-uuid-1';
const PAGE_ID = 'page-uuid-1';
const USER_ID = 'user-uuid-1';

const alwaysAllowGuard = { canActivate: () => true };

const tenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const user: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('WebsitePagesController', () => {
  let controller: WebsitePagesController;
  let mockService: {
    list: jest.Mock;
    getNavigation: jest.Mock;
    getById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    publish: jest.Mock;
    unpublish: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      getNavigation: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      unpublish: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebsitePagesController],
      providers: [{ provide: WebsitePagesService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PermissionGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(ModuleEnabledGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get<WebsitePagesController>(WebsitePagesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate list to the service', async () => {
    const query = { page: 1, pageSize: 20 };
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValueOnce(response);

    const result = await controller.list(tenant, query);
    expect(result).toEqual(response);
    expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
  });

  it('should delegate getNavigation to the service', async () => {
    const nav = [{ id: PAGE_ID, slug: 'about', title: 'About' }];
    mockService.getNavigation.mockResolvedValueOnce(nav);

    const result = await controller.getNavigation(tenant, 'en');
    expect(result).toEqual(nav);
    expect(mockService.getNavigation).toHaveBeenCalledWith(TENANT_ID, 'en');
  });

  it('should delegate getById to the service', async () => {
    const page = { id: PAGE_ID, title: 'About' };
    mockService.getById.mockResolvedValueOnce(page);

    const result = await controller.getById(tenant, PAGE_ID);
    expect(result).toEqual(page);
    expect(mockService.getById).toHaveBeenCalledWith(TENANT_ID, PAGE_ID);
  });

  it('should delegate create to the service with tenant and user', async () => {
    const dto = { page_type: 'about', slug: 'about-us', title: 'About Us', body_html: '<p>hi</p>' };
    const created = { id: PAGE_ID, ...dto };
    mockService.create.mockResolvedValueOnce(created);

    const result = await controller.create(tenant, user, dto as never);
    expect(result).toEqual(created);
    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should delegate update to the service', async () => {
    const dto = { title: 'Updated Title' };
    const updated = { id: PAGE_ID, title: 'Updated Title' };
    mockService.update.mockResolvedValueOnce(updated);

    const result = await controller.update(tenant, PAGE_ID, dto as never);
    expect(result).toEqual(updated);
    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, PAGE_ID, dto);
  });

  it('should delegate publish to the service', async () => {
    const published = { id: PAGE_ID, status: 'published' };
    mockService.publish.mockResolvedValueOnce(published);

    const result = await controller.publish(tenant, PAGE_ID);
    expect(result).toEqual(published);
    expect(mockService.publish).toHaveBeenCalledWith(TENANT_ID, PAGE_ID);
  });

  it('should delegate unpublish to the service', async () => {
    const unpublished = { id: PAGE_ID, status: 'unpublished' };
    mockService.unpublish.mockResolvedValueOnce(unpublished);

    const result = await controller.unpublish(tenant, PAGE_ID);
    expect(result).toEqual(unpublished);
    expect(mockService.unpublish).toHaveBeenCalledWith(TENANT_ID, PAGE_ID);
  });

  it('should delegate delete to the service', async () => {
    mockService.delete.mockResolvedValueOnce(undefined);

    const result = await controller.delete(tenant, PAGE_ID);
    expect(result).toBeUndefined();
    expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, PAGE_ID);
  });
});
