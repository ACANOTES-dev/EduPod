/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type {
  CreateRetentionHoldDto,
  JwtPayload,
  RetentionHoldsQueryDto,
  RetentionPreviewRequestDto,
  TenantContext,
  UpdateRetentionPolicyDto,
} from '@school/shared';

import {
  RetentionHoldsController,
  RetentionPoliciesController,
} from './retention-policies.controller';
import { RetentionPoliciesService } from './retention-policies.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const POLICY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockJwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildMockRetentionPoliciesService() {
  return {
    getEffectivePolicies: jest.fn(),
    overridePolicy: jest.fn(),
    previewRetention: jest.fn(),
    createHold: jest.fn(),
    releaseHold: jest.fn(),
    listHolds: jest.fn(),
  };
}

// ─── RetentionPoliciesController ─────────────────────────────────────────────

describe('RetentionPoliciesController', () => {
  let controller: RetentionPoliciesController;
  let service: ReturnType<typeof buildMockRetentionPoliciesService>;

  beforeEach(async () => {
    service = buildMockRetentionPoliciesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetentionPoliciesController],
      providers: [{ provide: RetentionPoliciesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RetentionPoliciesController>(RetentionPoliciesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call getEffectivePolicies with tenant_id and return the result', async () => {
    const expected = { data: [{ id: POLICY_ID, data_category: 'audit_logs' }] };
    service.getEffectivePolicies.mockResolvedValue(expected);

    const result = await controller.listPolicies(mockTenant);

    expect(service.getEffectivePolicies).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('should call overridePolicy with tenant_id, policy id, and dto', async () => {
    const dto: UpdateRetentionPolicyDto = { retention_months: 36 };
    const expected = { id: POLICY_ID, retention_months: 36 };
    service.overridePolicy.mockResolvedValue(expected);

    const result = await controller.overridePolicy(mockTenant, POLICY_ID, dto);

    expect(service.overridePolicy).toHaveBeenCalledWith(TENANT_ID, POLICY_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call previewRetention with tenant_id and dto', async () => {
    const dto: RetentionPreviewRequestDto = { data_category: 'audit_logs' };
    const expected = { data: [{ data_category: 'audit_logs', affected_count: 120 }] };
    service.previewRetention.mockResolvedValue(expected);

    const result = await controller.previewRetention(mockTenant, dto);

    expect(service.previewRetention).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });
});

// ─── RetentionHoldsController ─────────────────────────────────────────────────

describe('RetentionHoldsController', () => {
  let controller: RetentionHoldsController;
  let service: ReturnType<typeof buildMockRetentionPoliciesService>;

  beforeEach(async () => {
    service = buildMockRetentionPoliciesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetentionHoldsController],
      providers: [{ provide: RetentionPoliciesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RetentionHoldsController>(RetentionHoldsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call createHold with tenant_id, user_id, and dto', async () => {
    const dto: CreateRetentionHoldDto = {
      subject_type: 'student',
      subject_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      reason: 'Ongoing legal proceedings',
    };
    const expected = { id: HOLD_ID, ...dto };
    service.createHold.mockResolvedValue(expected);

    const result = await controller.createHold(mockTenant, mockJwtPayload, dto);

    expect(service.createHold).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call releaseHold with tenant_id and hold id', async () => {
    const expected = { id: HOLD_ID, released_at: '2026-03-28T10:00:00.000Z' };
    service.releaseHold.mockResolvedValue(expected);

    const result = await controller.releaseHold(mockTenant, HOLD_ID);

    expect(service.releaseHold).toHaveBeenCalledWith(TENANT_ID, HOLD_ID);
    expect(result).toBe(expected);
  });

  it('should call listHolds with tenant_id and query', async () => {
    const query: RetentionHoldsQueryDto = { page: 1, pageSize: 20 };
    const expected = {
      data: [{ id: HOLD_ID }],
      meta: { page: 1, pageSize: 20, total: 1 },
    };
    service.listHolds.mockResolvedValue(expected);

    const result = await controller.listHolds(mockTenant, query);

    expect(service.listHolds).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });
});
