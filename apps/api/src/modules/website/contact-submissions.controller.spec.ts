import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ContactFormService } from './contact-form.service';
import { ContactSubmissionsController } from './contact-submissions.controller';

const TENANT_ID = 'tenant-uuid-1';
const SUBMISSION_ID = 'sub-uuid-1';

const alwaysAllowGuard = { canActivate: () => true };

const tenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('ContactSubmissionsController', () => {
  let controller: ContactSubmissionsController;
  let mockService: {
    list: jest.Mock;
    updateStatus: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactSubmissionsController],
      providers: [{ provide: ContactFormService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PermissionGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(ModuleEnabledGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get<ContactSubmissionsController>(ContactSubmissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate list to the service with query parameters', async () => {
    const query = { page: 1, pageSize: 20 };
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValueOnce(response);

    const result = await controller.list(tenant, query as never);
    expect(result).toEqual(response);
    expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
  });

  it('should delegate updateStatus to the service', async () => {
    const dto = { status: 'reviewed' };
    const updated = { id: SUBMISSION_ID, status: 'reviewed' };
    mockService.updateStatus.mockResolvedValueOnce(updated);

    const result = await controller.updateStatus(tenant, SUBMISSION_ID, dto as never);
    expect(result).toEqual(updated);
    expect(mockService.updateStatus).toHaveBeenCalledWith(TENANT_ID, SUBMISSION_ID, 'reviewed');
  });

  it('should propagate service errors to the caller', async () => {
    mockService.list.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      controller.list(tenant, { page: 1, pageSize: 20 } as never),
    ).rejects.toThrow('DB error');
  });
});
