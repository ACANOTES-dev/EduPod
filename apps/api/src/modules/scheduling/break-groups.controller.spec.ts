/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { BreakGroupsController } from './break-groups.controller';
import { BreakGroupsService } from './break-groups.service';


const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const AY_ID = 'ay-uuid';
const BG_ID = 'bg-uuid';

const mockService = {
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('BreakGroupsController', () => {
  let controller: BreakGroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BreakGroupsController],
      providers: [{ provide: BreakGroupsService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BreakGroupsController>(BreakGroupsController);
    jest.clearAllMocks();
  });

  it('should call service.list with tenant_id and academic_year_id', async () => {
    const mockResult = [{ id: BG_ID, name: 'Morning Break' }];
    mockService.list.mockResolvedValue(mockResult);

    const result = await controller.list(TENANT, { academic_year_id: AY_ID });

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(mockResult);
  });

  it('should call service.create with tenant_id and dto', async () => {
    const dto = {
      academic_year_id: AY_ID,
      name: 'Lunch Break',
      required_supervisor_count: 1,
      year_group_ids: ['yg1', 'yg2'],
    };
    const created = { id: BG_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(TENANT, dto);

    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(created);
  });

  it('should call service.update with tenant_id, id, and dto', async () => {
    const dto = { name: 'Updated Break' };
    const updated = { id: BG_ID, ...dto };
    mockService.update.mockResolvedValue(updated);

    const result = await controller.update(TENANT, BG_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', BG_ID, dto);
    expect(result).toEqual(updated);
  });

  it('should call service.delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ success: true });

    const result = await controller.delete(TENANT, BG_ID);

    expect(mockService.delete).toHaveBeenCalledWith('tenant-uuid', BG_ID);
    expect(result).toEqual({ success: true });
  });
});
