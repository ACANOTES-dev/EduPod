import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';
import request from 'supertest';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenGoalController } from './sen-goal.controller';
import { SenGoalService } from './sen-goal.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GOAL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STRATEGY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const MEMBERSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('SenGoalController', () => {
  let controller: SenGoalController;

  const mockService = {
    create: jest.fn(),
    findAllByPlan: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    recordProgress: jest.fn(),
    findProgress: jest.fn(),
    createStrategy: jest.fn(),
    findStrategies: jest.fn(),
    updateStrategy: jest.fn(),
    deleteStrategy: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage']),
  };

  const user: JwtPayload = {
    sub: USER_ID,
    email: 'test@test.com',
    tenant_id: TENANT_ID,
    membership_id: MEMBERSHIP_ID,
    type: 'access',
    iat: 0,
    exp: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenGoalController],
      providers: [
        { provide: SenGoalService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SenGoalController>(SenGoalController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view', 'sen.manage']);
  });

  afterEach(() => jest.clearAllMocks());

  it('has module-enabled metadata', () => {
    expect(Reflect.getMetadata(MODULE_ENABLED_KEY, SenGoalController)).toBe('sen');
  });

  it('delegates create and list-by-plan', async () => {
    mockService.create.mockResolvedValue({ id: GOAL_ID });
    mockService.findAllByPlan.mockResolvedValue([{ id: GOAL_ID }]);

    await controller.create(TENANT, PLAN_ID, {
      title: 'Goal',
      target: 'Target',
      baseline: 'Baseline',
      target_date: '2026-06-30',
    });
    await controller.findAllByPlan(TENANT, user, PLAN_ID, {});

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, PLAN_ID, {
      title: 'Goal',
      target: 'Target',
      baseline: 'Baseline',
      target_date: '2026-06-30',
    });
    expect(mockService.findAllByPlan).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      PLAN_ID,
      {},
    );
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenGoalController.prototype.create)).toBe(
      'sen.manage',
    );
  });

  it('delegates update, transitionStatus, and progress actions', async () => {
    mockService.update.mockResolvedValue({ id: GOAL_ID });
    mockService.transitionStatus.mockResolvedValue({ id: GOAL_ID, status: 'achieved' });
    mockService.recordProgress.mockResolvedValue({ id: 'progress-id' });
    mockService.findProgress.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.update(TENANT, GOAL_ID, { title: 'Updated' });
    await controller.transitionStatus(TENANT, user, GOAL_ID, { status: 'achieved' });
    await controller.recordProgress(TENANT, user, GOAL_ID, { note: 'Strong week' });
    await controller.findProgress(TENANT, user, GOAL_ID, { page: 1, pageSize: 20 });

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, GOAL_ID, { title: 'Updated' });
    expect(mockService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      GOAL_ID,
      { status: 'achieved' },
      USER_ID,
    );
    expect(mockService.recordProgress).toHaveBeenCalledWith(
      TENANT_ID,
      GOAL_ID,
      { note: 'Strong week' },
      USER_ID,
    );
    expect(mockService.findProgress).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      GOAL_ID,
      { page: 1, pageSize: 20 },
    );
  });

  it('delegates strategy actions', async () => {
    mockService.createStrategy.mockResolvedValue({ id: STRATEGY_ID });
    mockService.findStrategies.mockResolvedValue([{ id: STRATEGY_ID }]);
    mockService.updateStrategy.mockResolvedValue({ id: STRATEGY_ID, description: 'Updated' });
    mockService.deleteStrategy.mockResolvedValue(undefined);

    await controller.createStrategy(TENANT, GOAL_ID, { description: 'Daily support' });
    await controller.findStrategies(TENANT, user, GOAL_ID, {});
    await controller.updateStrategy(TENANT, STRATEGY_ID, { description: 'Updated' });
    await controller.deleteStrategy(TENANT, STRATEGY_ID);

    expect(mockService.createStrategy).toHaveBeenCalledWith(TENANT_ID, GOAL_ID, {
      description: 'Daily support',
    });
    expect(mockService.findStrategies).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      GOAL_ID,
    );
    expect(mockService.updateStrategy).toHaveBeenCalledWith(TENANT_ID, STRATEGY_ID, {
      description: 'Updated',
    });
    expect(mockService.deleteStrategy).toHaveBeenCalledWith(TENANT_ID, STRATEGY_ID);
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenGoalController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenGoalController],
      providers: [
        { provide: SenGoalService, useValue: {} },
        {
          provide: PermissionCacheService,
          useValue: { getPermissions: jest.fn().mockResolvedValue([]) },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks sen.manage permission (POST /v1/sen/plans/:planId/goals)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/sen/plans/${PLAN_ID}/goals`)
      .send({ title: 'Goal', target: 'Target', baseline: 'Baseline', target_date: '2026-06-30' })
      .expect(403);
  });
});
