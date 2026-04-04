/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { CurriculumRequirementsController } from './curriculum-requirements.controller';
import { CurriculumRequirementsService } from './curriculum-requirements.service';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const AY_ID = 'ay-uuid';
const YG_ID = 'yg-uuid';
const REQ_ID = 'req-uuid';

const mockService = {
  list: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  bulkUpsert: jest.fn(),
  copyFromAcademicYear: jest.fn(),
};

describe('CurriculumRequirementsController', () => {
  let controller: CurriculumRequirementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurriculumRequirementsController],
      providers: [
        { provide: AcademicReadFacade, useValue: {
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
    } },
        { provide: ClassesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
      countEnrolledStudents: jest.fn().mockResolvedValue(0),
      findOtherClassEnrolmentsForStudents: jest.fn().mockResolvedValue([]),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByYearGroup: jest.fn().mockResolvedValue([]),
      findIdsByAcademicYear: jest.fn().mockResolvedValue([]),
      countByAcademicYear: jest.fn().mockResolvedValue(0),
      findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
      findClassIdsForStudent: jest.fn().mockResolvedValue([]),
      findEnrolmentPairsForAcademicYear: jest.fn().mockResolvedValue([]),
    } },
        { provide: GradebookReadFacade, useValue: {
      findClassSubjectConfigs: jest.fn().mockResolvedValue([]),
    } },{ provide: CurriculumRequirementsService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CurriculumRequirementsController>(CurriculumRequirementsController);
    jest.clearAllMocks();
  });

  it('should call service.list with tenant_id and query params', async () => {
    const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValue(mockResult);

    const query = { academic_year_id: AY_ID, page: 1, pageSize: 20 };
    const result = await controller.list(TENANT, query);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', {
      page: 1,
      pageSize: 20,
      academic_year_id: AY_ID,
      year_group_id: undefined,
    });
    expect(result).toEqual(mockResult);
  });

  it('should call service.getById with tenant_id and id', async () => {
    const mockReq = { id: REQ_ID, subject_id: 's1', min_periods_per_week: 4 };
    mockService.getById.mockResolvedValue(mockReq);

    const result = await controller.getById(TENANT, REQ_ID);

    expect(mockService.getById).toHaveBeenCalledWith('tenant-uuid', REQ_ID);
    expect(result).toEqual(mockReq);
  });

  it('should call service.create with tenant_id and dto', async () => {
    const dto = {
      academic_year_id: AY_ID,
      year_group_id: YG_ID,
      subject_id: 'sub-uuid',
      min_periods_per_week: 5,
      max_periods_per_day: 1,
      requires_double_period: false,
    };
    const created = { id: REQ_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(TENANT, dto);

    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(created);
  });

  it('should call service.update with tenant_id, id and dto', async () => {
    const dto = { min_periods_per_week: 3 };
    const updated = { id: REQ_ID, ...dto };
    mockService.update.mockResolvedValue(updated);

    const result = await controller.update(TENANT, REQ_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', REQ_ID, dto);
    expect(result).toEqual(updated);
  });

  it('should call service.delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ success: true });

    const result = await controller.delete(TENANT, REQ_ID);

    expect(mockService.delete).toHaveBeenCalledWith('tenant-uuid', REQ_ID);
    expect(result).toEqual({ success: true });
  });

  it('should call service.bulkUpsert with correct params', async () => {
    const items = [
      {
        academic_year_id: AY_ID,
        year_group_id: YG_ID,
        subject_id: 's1',
        min_periods_per_week: 4,
        max_periods_per_day: 1,
        requires_double_period: false,
      },
    ];
    const dto = { academic_year_id: AY_ID, year_group_id: YG_ID, items };
    mockService.bulkUpsert.mockResolvedValue({ count: 1 });

    const result = await controller.bulkUpsert(TENANT, dto);

    expect(mockService.bulkUpsert).toHaveBeenCalledWith('tenant-uuid', AY_ID, YG_ID, items);
    expect(result).toEqual({ count: 1 });
  });

  it('should call service.copyFromAcademicYear with correct params', async () => {
    const dto = {
      source_academic_year_id: 'src-ay',
      target_academic_year_id: 'tgt-ay',
    };
    mockService.copyFromAcademicYear.mockResolvedValue({ copied: 5 });

    const result = await controller.copy(TENANT, dto);

    expect(mockService.copyFromAcademicYear).toHaveBeenCalledWith(
      'tenant-uuid',
      'src-ay',
      'tgt-ay',
    );
    expect(result).toEqual({ copied: 5 });
  });
});
