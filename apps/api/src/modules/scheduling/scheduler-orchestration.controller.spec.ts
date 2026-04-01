/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { SchedulerOrchestrationController } from './scheduler-orchestration.controller';
import { SchedulerOrchestrationService } from './scheduler-orchestration.service';

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
  email: 'admin@example.com',
  tenant_id: 'tenant-uuid',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};
const AY_ID = 'ay-uuid';
const RUN_ID = 'run-uuid';

const mockService = {
  checkPrerequisites: jest.fn(),
  triggerSolverRun: jest.fn(),
  listRuns: jest.fn(),
  getRun: jest.fn(),
  applyRun: jest.fn(),
  discardRun: jest.fn(),
  getRunStatus: jest.fn(),
};

describe('SchedulerOrchestrationController', () => {
  let controller: SchedulerOrchestrationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerOrchestrationController],
      providers: [{ provide: SchedulerOrchestrationService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SchedulerOrchestrationController>(SchedulerOrchestrationController);
    jest.clearAllMocks();
  });

  it('should call service.checkPrerequisites with tenant_id and academic_year_id', async () => {
    const prereqs = { ready: true, missing: [] };
    mockService.checkPrerequisites.mockResolvedValue(prereqs);

    const result = await controller.checkPrerequisites(TENANT, {
      academic_year_id: AY_ID,
    });

    expect(mockService.checkPrerequisites).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(prereqs);
  });

  it('should call service.triggerSolverRun with correct params', async () => {
    const dto = { academic_year_id: AY_ID, max_solver_duration_seconds: 120 };
    const run = { id: RUN_ID, status: 'pending' };
    mockService.triggerSolverRun.mockResolvedValue(run);

    const result = await controller.trigger(TENANT, USER, dto);

    expect(mockService.triggerSolverRun).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      'user-uuid',
      dto,
    );
    expect(result).toEqual(run);
  });

  it('should call service.listRuns with correct params', async () => {
    const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listRuns.mockResolvedValue(mockResult);

    const query = { academic_year_id: AY_ID, page: 1, pageSize: 20 };
    const result = await controller.listRuns(TENANT, query);

    expect(mockService.listRuns).toHaveBeenCalledWith('tenant-uuid', AY_ID, 1, 20);
    expect(result).toEqual(mockResult);
  });

  it('should call service.getRun with tenant_id and id', async () => {
    const run = { id: RUN_ID, status: 'completed' };
    mockService.getRun.mockResolvedValue(run);

    const result = await controller.getRun(TENANT, RUN_ID);

    expect(mockService.getRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(run);
  });

  it('should call service.applyRun with correct params', async () => {
    const applied = { id: RUN_ID, status: 'applied' };
    mockService.applyRun.mockResolvedValue(applied);

    const result = await controller.applyRun(TENANT, USER, RUN_ID, {
      acknowledged_violations: true,
    });

    expect(mockService.applyRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID, 'user-uuid', true);
    expect(result).toEqual(applied);
  });

  it('should call service.discardRun with tenant_id and id', async () => {
    const discarded = { id: RUN_ID, status: 'discarded' };
    mockService.discardRun.mockResolvedValue(discarded);

    const result = await controller.discardRun(TENANT, RUN_ID);

    expect(mockService.discardRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(discarded);
  });

  it('should call service.getRunStatus with tenant_id and id', async () => {
    const status = { status: 'running', progress: 45 };
    mockService.getRunStatus.mockResolvedValue(status);

    const result = await controller.getRunStatus(TENANT, RUN_ID);

    expect(mockService.getRunStatus).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(status);
  });
});
