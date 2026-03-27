import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourGuardianRestrictionsController } from './behaviour-guardian-restrictions.controller';
import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';

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
  create: jest.fn(),
  list: jest.fn(),
  listActive: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
};

describe('BehaviourGuardianRestrictionsController', () => {
  let controller: BehaviourGuardianRestrictionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourGuardianRestrictionsController],
      providers: [
        { provide: BehaviourGuardianRestrictionsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourGuardianRestrictionsController>(BehaviourGuardianRestrictionsController);
    jest.clearAllMocks();
  });

  it('should call restrictionsService.create with tenant_id, user sub, and dto', async () => {
    const dto = { guardian_id: 'g-1', student_id: 's-1', restriction_type: 'no_contact' };
    mockService.create.mockResolvedValue({ id: 'restr-1' });

    const result = await controller.create(TENANT, USER, dto as never);

    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
    expect(result).toEqual({ id: 'restr-1' });
  });

  it('should call restrictionsService.list with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.list(TENANT, query as never);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call restrictionsService.listActive with tenant_id', async () => {
    mockService.listActive.mockResolvedValue([{ id: 'restr-1', active: true }]);

    const result = await controller.listActive(TENANT);

    expect(mockService.listActive).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual([{ id: 'restr-1', active: true }]);
  });

  it('should call restrictionsService.getDetail with tenant_id and id', async () => {
    mockService.getDetail.mockResolvedValue({ id: 'restr-1', restriction_type: 'no_contact' });

    const result = await controller.getDetail(TENANT, 'restr-1');

    expect(mockService.getDetail).toHaveBeenCalledWith('tenant-uuid', 'restr-1');
    expect(result).toEqual({ id: 'restr-1', restriction_type: 'no_contact' });
  });

  it('should call restrictionsService.update with tenant_id, id, user sub, and dto', async () => {
    const dto = { notes: 'Updated restriction notes' };
    mockService.update.mockResolvedValue({ id: 'restr-1' });

    const result = await controller.update(TENANT, USER, 'restr-1', dto as never);

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'restr-1', 'user-uuid', dto);
    expect(result).toEqual({ id: 'restr-1' });
  });

  it('should call restrictionsService.revoke with tenant_id, id, user sub, and reason', async () => {
    const dto = { reason: 'Court order lifted' };
    mockService.revoke.mockResolvedValue({ id: 'restr-1', status: 'revoked' });

    const result = await controller.revoke(TENANT, USER, 'restr-1', dto as never);

    expect(mockService.revoke).toHaveBeenCalledWith('tenant-uuid', 'restr-1', 'user-uuid', 'Court order lifted');
    expect(result).toEqual({ id: 'restr-1', status: 'revoked' });
  });
});
