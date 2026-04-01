import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
};

describe('DiscountsController', () => {
  let controller: DiscountsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscountsController],
      providers: [{ provide: DiscountsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DiscountsController>(DiscountsController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.findOne with tenant and id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'd-1' });
    await controller.findOne(TENANT, 'd-1');
    expect(mockService.findOne).toHaveBeenCalledWith('tenant-uuid', 'd-1');
  });

  it('should call service.create with tenant and dto', async () => {
    const dto = { name: 'Sibling Discount' } as never;
    mockService.create.mockResolvedValue({ id: 'd-new' });
    await controller.create(TENANT, dto);
    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
  });

  it('should call service.update with tenant, id and dto', async () => {
    const dto = { name: 'Updated' } as never;
    mockService.update.mockResolvedValue({ id: 'd-1' });
    await controller.update(TENANT, 'd-1', dto);
    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'd-1', dto);
  });

  it('should call service.deactivate with tenant and id', async () => {
    mockService.deactivate.mockResolvedValue({ id: 'd-1', status: 'inactive' });
    await controller.deactivate(TENANT, 'd-1');
    expect(mockService.deactivate).toHaveBeenCalledWith('tenant-uuid', 'd-1');
  });
});
