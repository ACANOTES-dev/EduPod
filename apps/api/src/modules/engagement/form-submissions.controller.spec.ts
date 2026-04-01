/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { FormSubmissionsController } from './form-submissions.controller';
import { FormSubmissionsService } from './form-submissions.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBMISSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mockTenant = { tenant_id: TENANT_ID };
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@test.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildMockSubmissionsService() {
  return {
    findAll: jest.fn(),
    findOne: jest.fn(),
    acknowledge: jest.fn(),
    getCompletionStats: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FormSubmissionsController', () => {
  let controller: FormSubmissionsController;
  let submissionsService: ReturnType<typeof buildMockSubmissionsService>;

  beforeEach(async () => {
    submissionsService = buildMockSubmissionsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormSubmissionsController],
      providers: [{ provide: FormSubmissionsService, useValue: submissionsService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FormSubmissionsController>(FormSubmissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call formSubmissionsService.findAll with tenantId and query', async () => {
    const query = { page: 1, pageSize: 20, order: 'desc' as const, form_template_id: TEMPLATE_ID };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    submissionsService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(submissionsService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call formSubmissionsService.getCompletionStats with tenantId and query', async () => {
    const query = { form_template_id: TEMPLATE_ID };
    const expected = { submitted: 10, pending: 5, expired: 1 };
    submissionsService.getCompletionStats.mockResolvedValue(expected);

    const result = await controller.getCompletionStats(mockTenant, query);

    expect(submissionsService.getCompletionStats).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call formSubmissionsService.findOne with tenantId and id', async () => {
    const expected = { id: SUBMISSION_ID, status: 'pending' };
    submissionsService.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, SUBMISSION_ID);

    expect(submissionsService.findOne).toHaveBeenCalledWith(TENANT_ID, SUBMISSION_ID);
    expect(result).toBe(expected);
  });

  it('should call formSubmissionsService.acknowledge with tenantId, id, and userId', async () => {
    const expected = { id: SUBMISSION_ID, status: 'acknowledged' };
    submissionsService.acknowledge.mockResolvedValue(expected);

    const result = await controller.acknowledge(mockTenant, mockUser, SUBMISSION_ID);

    expect(submissionsService.acknowledge).toHaveBeenCalledWith(TENANT_ID, SUBMISSION_ID, USER_ID);
    expect(result).toBe(expected);
  });
});
