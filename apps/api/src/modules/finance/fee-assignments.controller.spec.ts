import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { FeeAssignmentsController } from './fee-assignments.controller';
import { FeeAssignmentsService } from './fee-assignments.service';

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
  endAssignment: jest.fn(),
};

describe('FeeAssignmentsController', () => {
  let controller: FeeAssignmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeeAssignmentsController],
      providers: [{ provide: FeeAssignmentsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<FeeAssignmentsController>(FeeAssignmentsController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.findOne with tenant and id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'fa-1' });
    await controller.findOne(TENANT, 'fa-1');
    expect(mockService.findOne).toHaveBeenCalledWith('tenant-uuid', 'fa-1');
  });

  it('should call service.create with tenant and dto', async () => {
    const dto = { fee_structure_id: 'fs-1', student_id: 's-1' } as never;
    mockService.create.mockResolvedValue({ id: 'fa-new' });
    await controller.create(TENANT, dto);
    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
  });

  it('should call service.update with tenant, id and dto', async () => {
    const dto = { amount_override: 500 } as never;
    mockService.update.mockResolvedValue({ id: 'fa-1' });
    await controller.update(TENANT, 'fa-1', dto);
    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'fa-1', dto);
  });

  it('should call service.endAssignment with tenant and id', async () => {
    mockService.endAssignment.mockResolvedValue({ id: 'fa-1' });
    await controller.endAssignment(TENANT, 'fa-1');
    expect(mockService.endAssignment).toHaveBeenCalledWith('tenant-uuid', 'fa-1');
  });
});
