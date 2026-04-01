import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';

const TENANT_ID = 'tenant-uuid-1';
const TEMPLATE_ID = 'template-uuid-1';

const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('NotificationTemplatesController', () => {
  let controller: NotificationTemplatesController;
  let mockService: {
    list: jest.Mock;
    getById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationTemplatesController],
      providers: [{ provide: NotificationTemplatesService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationTemplatesController>(NotificationTemplatesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service.list with tenant_id and query', async () => {
    const query = {} as {
      channel?: 'email' | 'whatsapp' | 'in_app';
      template_key?: string;
      locale?: string;
    };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValue(expected);

    const result = await controller.list(tenantCtx, query);

    expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual(expected);
  });

  it('should call service.getById with tenant_id and id', async () => {
    const template = { id: TEMPLATE_ID, name: 'Welcome' };
    mockService.getById.mockResolvedValue(template);

    const result = await controller.getById(tenantCtx, TEMPLATE_ID);

    expect(mockService.getById).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
    expect(result).toEqual(template);
  });

  it('should call service.create with tenant_id and dto', async () => {
    const dto = {
      channel: 'email' as const,
      template_key: 'welcome',
      locale: 'en',
      body_template: 'Hello {{name}}',
      subject_template: 'Welcome',
    };
    const created = { id: TEMPLATE_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(tenantCtx, dto);

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual(created);
  });

  it('should call service.update with tenant_id, id and dto', async () => {
    const dto = { body_template: 'Updated body {{name}}' };
    const updated = { id: TEMPLATE_ID, body_template: 'Updated body {{name}}' };
    mockService.update.mockResolvedValue(updated);

    const result = await controller.update(tenantCtx, TEMPLATE_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, dto);
    expect(result).toEqual(updated);
  });
});
