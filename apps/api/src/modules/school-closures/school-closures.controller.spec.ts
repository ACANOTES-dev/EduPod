import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SchoolClosuresController } from './school-closures.controller';
import { SchoolClosuresService } from './school-closures.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const CLOSURE_ID = 'closure-uuid-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'membership-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SchoolClosuresController', () => {
  let controller: SchoolClosuresController;
  let mockService: {
    create: jest.Mock;
    bulkCreate: jest.Mock;
    findAll: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      create: jest.fn(),
      bulkCreate: jest.fn(),
      findAll: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolClosuresController],
      providers: [{ provide: SchoolClosuresService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchoolClosuresController>(SchoolClosuresController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a single closure', async () => {
    const dto = {
      closure_date: '2025-12-25',
      reason: 'Christmas',
      affects_scope: 'all' as const,
    };
    const expected = { id: CLOSURE_ID, ...dto };
    mockService.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should bulk create closures', async () => {
    const dto = {
      start_date: '2025-12-25',
      end_date: '2025-12-26',
      reason: 'Christmas Break',
      affects_scope: 'all' as const,
      skip_weekends: true,
    };
    const expected = { created: 2 };
    mockService.bulkCreate.mockResolvedValue(expected);

    const result = await controller.bulkCreate(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockService.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should list closures with filters', async () => {
    const expected = {
      data: [],
      meta: { page: 1, pageSize: 50, total: 0 },
    };
    mockService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, {
      page: 1,
      pageSize: 50,
    });

    expect(result).toEqual(expected);
    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 50,
      start_date: undefined,
      end_date: undefined,
      affects_scope: undefined,
    });
  });

  it('should delete a closure', async () => {
    mockService.remove.mockResolvedValue(undefined);

    await controller.remove(mockTenant, CLOSURE_ID);

    expect(mockService.remove).toHaveBeenCalledWith(TENANT_ID, CLOSURE_ID);
  });
});
