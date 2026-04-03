import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const REQUEST_ID = 'request-uuid-1';

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

describe('ApprovalRequestsController', () => {
  let controller: ApprovalRequestsController;
  let mockService: {
    listRequests: jest.Mock;
    getRequest: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    cancel: jest.Mock;
    retryCallback: jest.Mock;
    bulkRetryCallbacks: jest.Mock;
    getCallbackHealth: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listRequests: jest.fn(),
      getRequest: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      cancel: jest.fn(),
      retryCallback: jest.fn(),
      bulkRetryCallbacks: jest.fn(),
      getCallbackHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalRequestsController],
      providers: [{ provide: ApprovalRequestsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApprovalRequestsController>(ApprovalRequestsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should list requests with filters', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listRequests.mockResolvedValue(expected);

    const result = await controller.listRequests(mockTenant, {
      page: 1,
      pageSize: 20,
      order: 'desc',
    });

    expect(result).toEqual(expected);
    expect(mockService.listRequests).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      status: undefined,
      callback_status: undefined,
    });
  });

  it('should get a single request by id', async () => {
    const expected = { id: REQUEST_ID, status: 'pending_approval' };
    mockService.getRequest.mockResolvedValue(expected);

    const result = await controller.getRequest(mockTenant, REQUEST_ID);

    expect(result).toEqual(expected);
    expect(mockService.getRequest).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
  });

  it('should approve a request', async () => {
    const expected = { id: REQUEST_ID, status: 'approved' };
    mockService.approve.mockResolvedValue(expected);

    const result = await controller.approveRequest(mockTenant, REQUEST_ID, mockUser, {
      comment: 'Looks good',
    });

    expect(result).toEqual(expected);
    expect(mockService.approve).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID, USER_ID, 'Looks good');
  });

  it('should reject a request', async () => {
    const expected = { id: REQUEST_ID, status: 'rejected' };
    mockService.reject.mockResolvedValue(expected);

    const result = await controller.rejectRequest(mockTenant, REQUEST_ID, mockUser, {
      comment: 'Needs revision',
    });

    expect(result).toEqual(expected);
    expect(mockService.reject).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      USER_ID,
      'Needs revision',
    );
  });

  it('should cancel a request', async () => {
    const expected = { id: REQUEST_ID, status: 'cancelled' };
    mockService.cancel.mockResolvedValue(expected);

    const result = await controller.cancelRequest(mockTenant, REQUEST_ID, mockUser, {
      comment: 'No longer needed',
    });

    expect(result).toEqual(expected);
    expect(mockService.cancel).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      USER_ID,
      'No longer needed',
    );
  });

  it('should retry a callback', async () => {
    const expected = { id: REQUEST_ID, status: 'approved', callback_status: 'pending' };
    mockService.retryCallback.mockResolvedValue(expected);

    const result = await controller.retryCallback(mockTenant, REQUEST_ID);

    expect(result).toEqual(expected);
    expect(mockService.retryCallback).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
  });

  it('should bulk retry callbacks', async () => {
    const expected = { retried: 3, skipped: 1 };
    mockService.bulkRetryCallbacks.mockResolvedValue(expected);

    const result = await controller.bulkRetryCallbacks(mockTenant, {
      status_filter: 'failed',
      max_count: 50,
    });

    expect(result).toEqual(expected);
    expect(mockService.bulkRetryCallbacks).toHaveBeenCalledWith(TENANT_ID, 'failed', 50);
  });

  it('should get callback health summary', async () => {
    const expected = { pending: 2, failed: 1, executed: 10, total: 13 };
    mockService.getCallbackHealth.mockResolvedValue(expected);

    const result = await controller.getCallbackHealth(mockTenant);

    expect(result).toEqual(expected);
    expect(mockService.getCallbackHealth).toHaveBeenCalledWith(TENANT_ID);
  });
});
