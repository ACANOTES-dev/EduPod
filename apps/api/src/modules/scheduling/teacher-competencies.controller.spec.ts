import { Test, TestingModule } from '@nestjs/testing';

import { TeacherCompetenciesController } from './teacher-competencies.controller';
import { TeacherCompetenciesService } from './teacher-competencies.service';

const TENANT = { tenant_id: 'tenant-uuid' };
const AY_ID = 'ay-uuid';
const STAFF_ID = 'staff-uuid';
const COMP_ID = 'comp-uuid';

const mockService = {
  listAll: jest.fn(),
  listByTeacher: jest.fn(),
  listBySubjectYear: jest.fn(),
  create: jest.fn(),
  bulkCreate: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteAllForTeacher: jest.fn(),
  copyFromAcademicYear: jest.fn(),
};

describe('TeacherCompetenciesController', () => {
  let controller: TeacherCompetenciesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeacherCompetenciesController],
      providers: [
        { provide: TeacherCompetenciesService, useValue: mockService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TeacherCompetenciesController>(
      TeacherCompetenciesController,
    );
    jest.clearAllMocks();
  });

  it('should call service.listAll with tenant_id and academic_year_id', async () => {
    const mockResult = [{ id: COMP_ID }];
    mockService.listAll.mockResolvedValue(mockResult);

    const result = await controller.listAll(TENANT, { academic_year_id: AY_ID });

    expect(mockService.listAll).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(mockResult);
  });

  it('should call service.listByTeacher with correct params', async () => {
    const mockResult = [{ id: COMP_ID, staff_profile_id: STAFF_ID }];
    mockService.listByTeacher.mockResolvedValue(mockResult);

    const result = await controller.listByTeacher(
      TENANT,
      STAFF_ID,
      { academic_year_id: AY_ID },
    );

    expect(mockService.listByTeacher).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      STAFF_ID,
    );
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
      is_primary: false,
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

    const result = await controller.deleteAllForTeacher(
      TENANT,
      STAFF_ID,
      { academic_year_id: AY_ID },
    );

    expect(mockService.deleteAllForTeacher).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      STAFF_ID,
    );
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
