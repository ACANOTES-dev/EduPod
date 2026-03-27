import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourAmendmentsController } from './behaviour-amendments.controller';
import { BehaviourAmendmentsService } from './behaviour-amendments.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockService = {
  list: jest.fn(),
  getPending: jest.fn(),
  getById: jest.fn(),
  sendCorrection: jest.fn(),
};

describe('BehaviourAmendmentsController', () => {
  let controller: BehaviourAmendmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAmendmentsController],
      providers: [
        { provide: BehaviourAmendmentsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourAmendmentsController>(BehaviourAmendmentsController);
    jest.clearAllMocks();
  });

  it('should call amendmentsService.list with tenant_id and filters', async () => {
    const filters = { page: 1, pageSize: 20 };
    mockService.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.list(TENANT, filters as never);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', filters);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call amendmentsService.getPending with tenant_id, page, and pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.getPending.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getPending(TENANT, query as never);

    expect(mockService.getPending).toHaveBeenCalledWith('tenant-uuid', 1, 20);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call amendmentsService.getById with tenant_id and id', async () => {
    mockService.getById.mockResolvedValue({ id: 'amend-1', status: 'pending' });

    const result = await controller.getById(TENANT, 'amend-1');

    expect(mockService.getById).toHaveBeenCalledWith('tenant-uuid', 'amend-1');
    expect(result).toEqual({ id: 'amend-1', status: 'pending' });
  });

  it('should call amendmentsService.sendCorrection with tenant_id, id, and user sub', async () => {
    mockService.sendCorrection.mockResolvedValue({ id: 'amend-1', correction_sent: true });

    const result = await controller.sendCorrection(TENANT, USER, 'amend-1');

    expect(mockService.sendCorrection).toHaveBeenCalledWith('tenant-uuid', 'amend-1', 'user-uuid');
    expect(result).toEqual({ id: 'amend-1', correction_sent: true });
  });
});
