import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

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
  findAll: jest.fn(),
  create: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  execute: jest.fn(),
};

describe('RefundsController', () => {
  let controller: RefundsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundsController],
      providers: [{ provide: RefundsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<RefundsController>(RefundsController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.create with tenant, user.sub and dto', async () => {
    const dto = { payment_id: 'pay-1', amount: 50 } as never;
    mockService.create.mockResolvedValue({ id: 'ref-new' });
    await controller.create(TENANT, USER, dto);
    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  it('should call service.approve with tenant, id, user.sub and comment', async () => {
    mockService.approve.mockResolvedValue({ id: 'ref-1', status: 'approved' });
    await controller.approve(TENANT, USER, 'ref-1', { comment: 'Looks good' });
    expect(mockService.approve).toHaveBeenCalledWith(
      'tenant-uuid',
      'ref-1',
      'user-uuid',
      'Looks good',
    );
  });

  it('should call service.reject with tenant, id, user.sub and comment', async () => {
    mockService.reject.mockResolvedValue({ id: 'ref-1', status: 'rejected' });
    await controller.reject(TENANT, USER, 'ref-1', { comment: 'Not eligible' });
    expect(mockService.reject).toHaveBeenCalledWith(
      'tenant-uuid',
      'ref-1',
      'user-uuid',
      'Not eligible',
    );
  });

  it('should call service.execute with tenant and id', async () => {
    mockService.execute.mockResolvedValue({ id: 'ref-1', status: 'executed' });
    await controller.execute(TENANT, 'ref-1');
    expect(mockService.execute).toHaveBeenCalledWith('tenant-uuid', 'ref-1');
  });
});
