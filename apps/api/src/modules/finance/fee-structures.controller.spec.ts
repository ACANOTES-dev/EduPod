import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { FeeStructuresController } from './fee-structures.controller';
import { FeeStructuresService } from './fee-structures.service';

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

describe('FeeStructuresController', () => {
  let controller: FeeStructuresController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeeStructuresController],
      providers: [{ provide: FeeStructuresService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<FeeStructuresController>(FeeStructuresController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.findOne with tenant and id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'fs-1' });
    await controller.findOne(TENANT, 'fs-1');
    expect(mockService.findOne).toHaveBeenCalledWith('tenant-uuid', 'fs-1');
  });

  it('should call service.create with tenant and dto', async () => {
    const dto = { name: 'Tuition' } as never;
    mockService.create.mockResolvedValue({ id: 'fs-new' });
    await controller.create(TENANT, dto);
    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
  });

  it('should call service.update with tenant, id and dto', async () => {
    const dto = { name: 'Updated' } as never;
    mockService.update.mockResolvedValue({ id: 'fs-1' });
    await controller.update(TENANT, 'fs-1', dto);
    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'fs-1', dto);
  });

  it('should call service.deactivate with tenant and id', async () => {
    mockService.deactivate.mockResolvedValue({ id: 'fs-1', status: 'inactive' });
    await controller.deactivate(TENANT, 'fs-1');
    expect(mockService.deactivate).toHaveBeenCalledWith('tenant-uuid', 'fs-1');
  });
});
