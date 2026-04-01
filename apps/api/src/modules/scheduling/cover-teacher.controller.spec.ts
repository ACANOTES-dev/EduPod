/* eslint-disable @typescript-eslint/no-require-imports */
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { CoverTeacherController } from './cover-teacher.controller';
import { CoverTeacherService } from './cover-teacher.service';

const TENANT = { tenant_id: 'tenant-uuid' };
const AY_ID = 'ay-uuid';

const mockService = {
  findCoverTeacher: jest.fn(),
};

describe('CoverTeacherController', () => {
  let controller: CoverTeacherController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoverTeacherController],
      providers: [{ provide: CoverTeacherService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CoverTeacherController>(CoverTeacherController);
    jest.clearAllMocks();
  });

  it('should call service.findCoverTeacher with all query params', async () => {
    const candidates = [
      {
        staff_profile_id: 'sp1',
        name: 'Teacher A',
        is_competent: true,
        is_primary: true,
        is_available: true,
        cover_count: 2,
        rank_score: 95,
      },
    ];
    mockService.findCoverTeacher.mockResolvedValue(candidates);

    const query = {
      academic_year_id: AY_ID,
      weekday: 1,
      period_order: 3,
      subject_id: 'sub-uuid',
      year_group_id: 'yg-uuid',
    };

    const result = await controller.findCoverTeacher(TENANT, query);

    expect(mockService.findCoverTeacher).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      1,
      3,
      'sub-uuid',
      'yg-uuid',
    );
    expect(result).toEqual(candidates);
  });

  it('should return empty array when no cover teachers available', async () => {
    mockService.findCoverTeacher.mockResolvedValue([]);

    const query = {
      academic_year_id: AY_ID,
      weekday: 5,
      period_order: 1,
      subject_id: 'sub-uuid',
      year_group_id: 'yg-uuid',
    };

    const result = await controller.findCoverTeacher(TENANT, query);

    expect(mockService.findCoverTeacher).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('should propagate service errors', async () => {
    mockService.findCoverTeacher.mockRejectedValue(new Error('DB failure'));

    const query = {
      academic_year_id: AY_ID,
      weekday: 3,
      period_order: 2,
      subject_id: 'sub-uuid',
      year_group_id: 'yg-uuid',
    };

    await expect(controller.findCoverTeacher(TENANT, query)).rejects.toThrow('DB failure');
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('CoverTeacherController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CoverTeacherController],
      providers: [{ provide: CoverTeacherService, useValue: mockService }],
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

  it('should return 403 when user lacks schedule.manage permission (GET /v1/scheduling/cover-teacher)', async () => {
    await request(app.getHttpServer()).get('/v1/scheduling/cover-teacher').send({}).expect(403);
  });
});
