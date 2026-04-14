/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TeacherCompetenciesController } from './teacher-competencies.controller';
import { TeacherCompetenciesService } from './teacher-competencies.service';

const TENANT = { tenant_id: 'tenant-uuid' };
const AY_ID = 'ay-uuid';
const STAFF_ID = 'staff-uuid';
const COMP_ID = 'comp-uuid';

const mockService = {
  list: jest.fn(),
  listByTeacher: jest.fn(),
  listBySubjectYear: jest.fn(),
  create: jest.fn(),
  bulkCreate: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteAllForTeacher: jest.fn(),
  copyFromAcademicYear: jest.fn(),
  getCoverage: jest.fn(),
  copyToYears: jest.fn(),
};

describe('TeacherCompetenciesController', () => {
  let controller: TeacherCompetenciesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeacherCompetenciesController],
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
          provide: ClassesReadFacade,
          useValue: {
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
          },
        },
        {
          provide: GradebookReadFacade,
          useValue: {
            findClassSubjectConfigs: jest.fn().mockResolvedValue([]),
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
        { provide: TeacherCompetenciesService, useValue: mockService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TeacherCompetenciesController>(TeacherCompetenciesController);
    jest.clearAllMocks();
  });

  it('should call service.list with tenant_id and the full query', async () => {
    const mockResult = { data: [{ id: COMP_ID }] };
    mockService.list.mockResolvedValue(mockResult);

    const result = await controller.list(TENANT, { academic_year_id: AY_ID });

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', { academic_year_id: AY_ID });
    expect(result).toEqual(mockResult);
  });

  it('threads class_id query into service.list', async () => {
    mockService.list.mockResolvedValue({ data: [] });

    await controller.list(TENANT, {
      academic_year_id: AY_ID,
      class_id: 'class-uuid',
    });

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', {
      academic_year_id: AY_ID,
      class_id: 'class-uuid',
    });
  });

  it('supports the "null" literal to filter for pool-only rows', async () => {
    mockService.list.mockResolvedValue({ data: [] });

    await controller.list(TENANT, { academic_year_id: AY_ID, class_id: 'null' });

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', {
      academic_year_id: AY_ID,
      class_id: 'null',
    });
  });

  it('calls service.update with tenant, id, and body', async () => {
    mockService.update.mockResolvedValue({ id: COMP_ID, class_id: 'class-uuid' });

    const result = await controller.update(TENANT, COMP_ID, { class_id: 'class-uuid' });

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', COMP_ID, {
      class_id: 'class-uuid',
    });
    expect(result).toEqual({ id: COMP_ID, class_id: 'class-uuid' });
  });

  it('calls service.getCoverage for the coverage endpoint', async () => {
    mockService.getCoverage.mockResolvedValue({ rows: [], summary: { total: 0 } });

    const result = await controller.getCoverage(TENANT, { academic_year_id: AY_ID });

    expect(mockService.getCoverage).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual({ rows: [], summary: { total: 0 } });
  });

  it('should call service.listByTeacher with correct params', async () => {
    const mockResult = [{ id: COMP_ID, staff_profile_id: STAFF_ID }];
    mockService.listByTeacher.mockResolvedValue(mockResult);

    const result = await controller.listByTeacher(TENANT, STAFF_ID, { academic_year_id: AY_ID });

    expect(mockService.listByTeacher).toHaveBeenCalledWith('tenant-uuid', AY_ID, STAFF_ID);
    expect(result).toEqual(mockResult);
  });

  it('should call service.listBySubjectYear with correct params', async () => {
    mockService.listBySubjectYear.mockResolvedValue([]);

    const query = {
      academic_year_id: AY_ID,
      subject_id: 'sub-uuid',
      year_group_id: 'yg-uuid',
    };
    const result = await controller.listBySubject(TENANT, query);

    expect(mockService.listBySubjectYear).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      'sub-uuid',
      'yg-uuid',
    );
    expect(result).toEqual([]);
  });

  it('should call service.create with tenant_id and dto', async () => {
    const dto = {
      academic_year_id: AY_ID,
      staff_profile_id: STAFF_ID,
      subject_id: 'sub-uuid',
      year_group_id: 'yg-uuid',
    };
    const created = { id: COMP_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(TENANT, dto);

    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(created);
  });

  it('should call service.delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ success: true });

    const result = await controller.delete(TENANT, COMP_ID);

    expect(mockService.delete).toHaveBeenCalledWith('tenant-uuid', COMP_ID);
    expect(result).toEqual({ success: true });
  });

  it('should call service.deleteAllForTeacher with correct params', async () => {
    mockService.deleteAllForTeacher.mockResolvedValue({ deleted: 3 });

    const result = await controller.deleteAllForTeacher(TENANT, STAFF_ID, {
      academic_year_id: AY_ID,
    });

    expect(mockService.deleteAllForTeacher).toHaveBeenCalledWith('tenant-uuid', AY_ID, STAFF_ID);
    expect(result).toEqual({ deleted: 3 });
  });

  it('should call service.copyFromAcademicYear with correct params', async () => {
    const dto = {
      source_academic_year_id: 'src-ay',
      target_academic_year_id: 'tgt-ay',
    };
    mockService.copyFromAcademicYear.mockResolvedValue({ copied: 10 });

    const result = await controller.copy(TENANT, dto);

    expect(mockService.copyFromAcademicYear).toHaveBeenCalledWith(
      'tenant-uuid',
      'src-ay',
      'tgt-ay',
    );
    expect(result).toEqual({ copied: 10 });
  });
});
