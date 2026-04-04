/* eslint-disable @typescript-eslint/no-require-imports */
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

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
      providers: [
        { provide: SchedulesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findCoreById: jest.fn().mockResolvedValue(null),
      existsById: jest.fn().mockResolvedValue(null),
      findBusyTeacherIds: jest.fn().mockResolvedValue(new Set()),
      countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
      findClassTimetable: jest.fn().mockResolvedValue([]),
      findPinnedEntries: jest.fn().mockResolvedValue([]),
      countPinnedEntries: jest.fn().mockResolvedValue(0),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findScheduledClassIds: jest.fn().mockResolvedValue([]),
      countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
      count: jest.fn().mockResolvedValue(0),
      hasRotationEntries: jest.fn().mockResolvedValue(false),
      countByRoom: jest.fn().mockResolvedValue(0),
      findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
      findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
      countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
      findByIdWithSwapContext: jest.fn().mockResolvedValue(null),
      hasConflict: jest.fn().mockResolvedValue(false),
      findByIdWithSubstitutionContext: jest.fn().mockResolvedValue(null),
      findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffAvailabilityReadFacade, useValue: {
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByStaffIds: jest.fn().mockResolvedValue([]),
      findByWeekday: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },{ provide: CoverTeacherService, useValue: mockService }],
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
