/* eslint-disable @typescript-eslint/no-require-imports */
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';

import { SchedulerValidationController } from './scheduler-validation.controller';
import { SchedulerValidationService } from './scheduler-validation.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const RUN_ID = 'run-uuid';

const mockService = {
  validateRun: jest.fn(),
};

describe('SchedulerValidationController', () => {
  let controller: SchedulerValidationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerValidationController],
      providers: [
        { provide: SchedulingRunsReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findStatusById: jest.fn().mockResolvedValue(null),
      findActiveRun: jest.fn().mockResolvedValue(null),
      countActiveRuns: jest.fn().mockResolvedValue(0),
      findLatestCompletedRun: jest.fn().mockResolvedValue(null),
      findLatestRunWithResult: jest.fn().mockResolvedValue(null),
      findLatestAppliedRun: jest.fn().mockResolvedValue(null),
      listRuns: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findHistoricalRuns: jest.fn().mockResolvedValue([]),
      findScenarioById: jest.fn().mockResolvedValue(null),
      findScenarioStatusById: jest.fn().mockResolvedValue(null),
      listScenarios: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findScenariosForComparison: jest.fn().mockResolvedValue([]),
    } },{ provide: SchedulerValidationService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SchedulerValidationController>(SchedulerValidationController);
    jest.clearAllMocks();
  });

  it('should call service.validateRun with tenant_id and run id', async () => {
    const validationResult = {
      violations: [],
      health_score: 100,
      summary: { tier1: 0, tier2: 0, tier3: 0 },
      cell_violations: {},
    };
    mockService.validateRun.mockResolvedValue(validationResult);

    const result = await controller.validate(TENANT, RUN_ID);

    expect(mockService.validateRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(validationResult);
  });

  it('should return violations when schedule is invalid', async () => {
    const validationResult = {
      violations: [
        {
          constraint: 'teacher_conflict',
          tier: 1,
          message: 'Teacher assigned to 2 classes at same time',
          affected_cells: [],
        },
        {
          constraint: 'consecutive_periods',
          tier: 2,
          message: 'Teacher has 6 consecutive periods',
          affected_cells: [],
        },
      ],
      health_score: 50,
      summary: { tier1: 1, tier2: 1, tier3: 0 },
      cell_violations: {},
    };
    mockService.validateRun.mockResolvedValue(validationResult);

    const result = await controller.validate(TENANT, RUN_ID);

    expect(result.violations).toHaveLength(2);
    expect(result.health_score).toBeLessThan(100);
  });

  it('should propagate service errors', async () => {
    mockService.validateRun.mockRejectedValue(new Error('Run not found'));

    await expect(controller.validate(TENANT, RUN_ID)).rejects.toThrow('Run not found');
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SchedulerValidationController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SchedulerValidationController],
      providers: [{ provide: SchedulerValidationService, useValue: mockService }],
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

  it('should return 403 when user lacks schedule.run_auto permission (POST /v1/scheduling/runs/123e4567-e89b-12d3-a456-426614174000/validate)', async () => {
    await request(app.getHttpServer())
      .post('/v1/scheduling/runs/123e4567-e89b-12d3-a456-426614174000/validate')
      .send({})
      .expect(403);
  });
});
