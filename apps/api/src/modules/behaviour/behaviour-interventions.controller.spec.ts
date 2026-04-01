/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourInterventionsController } from './behaviour-interventions.controller';
import { BehaviourInterventionsService } from './behaviour-interventions.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INTERVENTION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const PERMISSIONS = ['behaviour.manage', 'behaviour.view_sensitive'];

const mockInterventionsService = {
  create: jest.fn(),
  list: jest.fn(),
  listOverdue: jest.fn(),
  listMy: jest.fn(),
  getOutcomeAnalytics: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  transitionStatus: jest.fn(),
  createReview: jest.fn(),
  listReviews: jest.fn(),
  getAutoPopulateData: jest.fn(),
  complete: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

describe('BehaviourInterventionsController', () => {
  let controller: BehaviourInterventionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourInterventionsController],
      providers: [
        { provide: BehaviourInterventionsService, useValue: mockInterventionsService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourInterventionsController>(BehaviourInterventionsController);
    mockPermissionCacheService.getPermissions.mockResolvedValue(PERMISSIONS);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Create ───────────────────────────────────────────────────────────────

  it('should call interventionsService.create with tenant_id, user_id, and dto', async () => {
    const dto = { student_id: 's1', type: 'mentoring', assigned_to: 'staff-1' };
    mockInterventionsService.create.mockResolvedValue({ id: INTERVENTION_ID });

    const result = await controller.create(TENANT, USER, dto as never);

    expect(mockInterventionsService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: INTERVENTION_ID });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('should call interventionsService.list with tenant_id, query, and hasSensitivePermission', async () => {
    const query = { page: 1, pageSize: 20 };
    mockInterventionsService.list.mockResolvedValue({ data: [] });

    const result = await controller.list(TENANT, USER, query as never);

    expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockInterventionsService.list).toHaveBeenCalledWith(TENANT_ID, query, true);
    expect(result).toEqual({ data: [] });
  });

  // ─── Static routes ────────────────────────────────────────────────────────

  it('should call interventionsService.listOverdue with tenant_id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockInterventionsService.listOverdue.mockResolvedValue({ data: [] });

    const result = await controller.listOverdue(TENANT, query);

    expect(mockInterventionsService.listOverdue).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('should call interventionsService.listMy with tenant_id, user_id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockInterventionsService.listMy.mockResolvedValue({ data: [] });

    const result = await controller.listMy(TENANT, USER, query);

    expect(mockInterventionsService.listMy).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('should call interventionsService.getOutcomeAnalytics with tenant_id and query', async () => {
    const query = { date_from: '2026-01-01' };
    mockInterventionsService.getOutcomeAnalytics.mockResolvedValue({ outcomes: [] });

    const result = await controller.getOutcomeAnalytics(TENANT, query as never);

    expect(mockInterventionsService.getOutcomeAnalytics).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ outcomes: [] });
  });

  // ─── Parameterised :id routes ─────────────────────────────────────────────

  it('should call interventionsService.getDetail with tenant_id, id, and hasSensitivePermission', async () => {
    mockInterventionsService.getDetail.mockResolvedValue({ id: INTERVENTION_ID });

    const result = await controller.getDetail(TENANT, USER, INTERVENTION_ID);

    expect(mockInterventionsService.getDetail).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      true,
    );
    expect(result).toEqual({ id: INTERVENTION_ID });
  });

  it('should call interventionsService.update with tenant_id, id, user_id, and dto', async () => {
    const dto = { notes: 'Updated' };
    mockInterventionsService.update.mockResolvedValue({ id: INTERVENTION_ID });

    const result = await controller.update(TENANT, USER, INTERVENTION_ID, dto as never);

    expect(mockInterventionsService.update).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INTERVENTION_ID });
  });

  it('should call interventionsService.transitionStatus with tenant_id, id, user_id, and dto', async () => {
    const dto = { status: 'in_progress' };
    mockInterventionsService.transitionStatus.mockResolvedValue({
      id: INTERVENTION_ID,
      status: 'in_progress',
    });

    const result = await controller.transitionStatus(TENANT, USER, INTERVENTION_ID, dto as never);

    expect(mockInterventionsService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INTERVENTION_ID, status: 'in_progress' });
  });

  // ─── Reviews ──────────────────────────────────────────────────────────────

  it('should call interventionsService.createReview with tenant_id, id, user_id, and dto', async () => {
    const dto = { outcome: 'positive', notes: 'Good progress' };
    mockInterventionsService.createReview.mockResolvedValue({ id: 'rev-1' });

    const result = await controller.createReview(TENANT, USER, INTERVENTION_ID, dto as never);

    expect(mockInterventionsService.createReview).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: 'rev-1' });
  });

  it('should call interventionsService.listReviews with tenant_id, id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockInterventionsService.listReviews.mockResolvedValue({ data: [] });

    const result = await controller.listReviews(TENANT, INTERVENTION_ID, query);

    expect(mockInterventionsService.listReviews).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      1,
      20,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Auto-Populate ────────────────────────────────────────────────────────

  it('should call interventionsService.getAutoPopulateData with tenant_id and id', async () => {
    mockInterventionsService.getAutoPopulateData.mockResolvedValue({ suggested: {} });

    const result = await controller.getAutoPopulateData(TENANT, INTERVENTION_ID);

    expect(mockInterventionsService.getAutoPopulateData).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
    );
    expect(result).toEqual({ suggested: {} });
  });

  // ─── Complete ─────────────────────────────────────────────────────────────

  it('should call interventionsService.complete with tenant_id, id, user_id, and dto', async () => {
    const dto = { outcome: 'resolved', notes: 'Student improved' };
    mockInterventionsService.complete.mockResolvedValue({
      id: INTERVENTION_ID,
      status: 'completed',
    });

    const result = await controller.complete(TENANT, USER, INTERVENTION_ID, dto as never);

    expect(mockInterventionsService.complete).toHaveBeenCalledWith(
      TENANT_ID,
      INTERVENTION_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INTERVENTION_ID, status: 'completed' });
  });
});
