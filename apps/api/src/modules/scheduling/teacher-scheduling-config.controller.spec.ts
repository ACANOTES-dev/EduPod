/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TeacherSchedulingConfigController } from './teacher-scheduling-config.controller';
import { TeacherSchedulingConfigService } from './teacher-scheduling-config.service';

const TENANT = { tenant_id: 'tenant-uuid' };
const AY_ID = 'ay-uuid';
const CONFIG_ID = 'config-uuid';

const mockService = {
  list: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  copyFromAcademicYear: jest.fn(),
};

describe('TeacherSchedulingConfigController', () => {
  let controller: TeacherSchedulingConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeacherSchedulingConfigController],
      providers: [
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: jest.fn().mockResolvedValue(null),
            findCurrentYearId: jest.fn().mockResolvedValue('year-1'),
            findYearById: jest.fn().mockResolvedValue(null),
            findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
            findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
            findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
            findYearGroupsWithActiveClasses: jest.fn().mockResolvedValue([]),
            findYearGroupsWithClassesAndCounts: jest.fn().mockResolvedValue([]),
            findAllYearGroups: jest.fn().mockResolvedValue([]),
            findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
            findSubjectById: jest.fn().mockResolvedValue(null),
            findYearGroupById: jest.fn().mockResolvedValue(null),
            findPeriodById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
        { provide: TeacherSchedulingConfigService, useValue: mockService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TeacherSchedulingConfigController>(TeacherSchedulingConfigController);
    jest.clearAllMocks();
  });

  it('should call service.list with tenant_id and academic_year_id', async () => {
    const mockResult = [{ id: CONFIG_ID, staff_profile_id: 'sp1' }];
    mockService.list.mockResolvedValue(mockResult);

    const result = await controller.list(TENANT, { academic_year_id: AY_ID });

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(mockResult);
  });

  it('should call service.upsert with tenant_id and dto', async () => {
    const dto = {
      academic_year_id: AY_ID,
      staff_profile_id: 'sp1',
      max_periods_per_day: 6,
      max_periods_per_week: 25,
    };
    const upserted = { id: CONFIG_ID, ...dto };
    mockService.upsert.mockResolvedValue(upserted);

    const result = await controller.upsert(TENANT, dto);

    expect(mockService.upsert).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(upserted);
  });

  it('should call service.delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ success: true });

    const result = await controller.delete(TENANT, CONFIG_ID);

    expect(mockService.delete).toHaveBeenCalledWith('tenant-uuid', CONFIG_ID);
    expect(result).toEqual({ success: true });
  });

  it('should call service.copyFromAcademicYear with correct params', async () => {
    const dto = {
      source_academic_year_id: 'src-ay',
      target_academic_year_id: 'tgt-ay',
    };
    mockService.copyFromAcademicYear.mockResolvedValue({ copied: 8 });

    const result = await controller.copy(TENANT, dto);

    expect(mockService.copyFromAcademicYear).toHaveBeenCalledWith(
      'tenant-uuid',
      'src-ay',
      'tgt-ay',
    );
    expect(result).toEqual({ copied: 8 });
  });
});
