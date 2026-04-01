import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const ANNOUNCEMENT_ID = 'announcement-uuid-1';

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

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;
  let mockService: {
    list: jest.Mock;
    listForParent: jest.Mock;
    getById: jest.Mock;
    getDeliveryStatus: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    publish: jest.Mock;
    archive: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      listForParent: jest.fn(),
      getById: jest.fn(),
      getDeliveryStatus: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      archive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [{ provide: AnnouncementsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnnouncementsController>(AnnouncementsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service.list with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20, sort: 'created_at', order: 'desc' as const };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValue(expected);

    const result = await controller.list(tenantCtx, query);

    expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual(expected);
  });

  it('should call service.listForParent with tenant_id, user_id and query', async () => {
    const query = { page: 1, pageSize: 20, sort: 'created_at', order: 'desc' as const };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listForParent.mockResolvedValue(expected);

    const result = await controller.listForParent(tenantCtx, userCtx, query);

    expect(mockService.listForParent).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
    expect(result).toEqual(expected);
  });

  it('should call service.getById with tenant_id and id', async () => {
    const announcement = { id: ANNOUNCEMENT_ID, title: 'Test' };
    mockService.getById.mockResolvedValue(announcement);

    const result = await controller.getById(tenantCtx, ANNOUNCEMENT_ID);

    expect(mockService.getById).toHaveBeenCalledWith(TENANT_ID, ANNOUNCEMENT_ID);
    expect(result).toEqual(announcement);
  });

  it('should call service.getDeliveryStatus with tenant_id and id', async () => {
    const status = { total: 10, delivered: 8, failed: 2 };
    mockService.getDeliveryStatus.mockResolvedValue(status);

    const result = await controller.getDeliveryStatus(tenantCtx, ANNOUNCEMENT_ID);

    expect(mockService.getDeliveryStatus).toHaveBeenCalledWith(TENANT_ID, ANNOUNCEMENT_ID);
    expect(result).toEqual(status);
  });

  it('should call service.create with tenant_id, user_id and dto', async () => {
    const dto = {
      title: 'New',
      body_html: '<p>Body</p>',
      scope: 'school' as const,
      target_payload: {},
      delivery_channels: ['in_app' as const],
    };
    const created = { id: ANNOUNCEMENT_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(tenantCtx, userCtx, dto);

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual(created);
  });

  it('should call service.update with tenant_id, id and dto', async () => {
    const dto = { title: 'Updated' };
    const updated = { id: ANNOUNCEMENT_ID, title: 'Updated' };
    mockService.update.mockResolvedValue(updated);

    const result = await controller.update(tenantCtx, ANNOUNCEMENT_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, ANNOUNCEMENT_ID, dto);
    expect(result).toEqual(updated);
  });

  it('should call service.publish with tenant_id, user_id, id and dto', async () => {
    const dto = {} as { scheduled_publish_at?: string | null };
    const published = { id: ANNOUNCEMENT_ID, status: 'published' };
    mockService.publish.mockResolvedValue(published);

    const result = await controller.publish(tenantCtx, userCtx, ANNOUNCEMENT_ID, dto);

    expect(mockService.publish).toHaveBeenCalledWith(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, dto);
    expect(result).toEqual(published);
  });

  it('should call service.archive with tenant_id and id', async () => {
    const archived = { id: ANNOUNCEMENT_ID, status: 'archived' };
    mockService.archive.mockResolvedValue(archived);

    const result = await controller.archive(tenantCtx, ANNOUNCEMENT_ID);

    expect(mockService.archive).toHaveBeenCalledWith(TENANT_ID, ANNOUNCEMENT_ID);
    expect(result).toEqual(archived);
  });
});
