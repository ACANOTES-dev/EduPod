/* eslint-disable @typescript-eslint/no-require-imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  StaffProfileReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { AssessmentsService } from './assessments/assessments.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { GradebookController } from './gradebook.controller';
import { GradesService } from './grades.service';
import { PeriodGradeComputationService } from './grading/period-grade-computation.service';
import { ResultsMatrixService } from './results-matrix.service';
import { YearGroupGradeWeightsService } from './year-group-grade-weights.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ASSESSMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CATEGORY_ID = '00000000-0000-0000-0000-000000000000';
const SNAPSHOT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-3333-3333-333333333333';

const tenantContext = { tenant_id: TENANT_ID };
const userContext = {
  sub: USER_ID,
  membership_id: MEMBERSHIP_ID,
  email: 'teacher@school.ie',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const mockClassGradeConfigsService = {
  upsert: jest.fn(),
  findByClass: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
};

const mockAssessmentsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  transitionStatus: jest.fn(),
  delete: jest.fn(),
};

const mockGradesService = {
  bulkUpsert: jest.fn(),
  findByAssessment: jest.fn(),
};

const mockPeriodGradeComputationService = {
  compute: jest.fn(),
};

const mockResultsMatrixService = {
  getMatrix: jest.fn(),
  saveMatrix: jest.fn(),
};

const mockBulkImportService = {
  generateTemplate: jest.fn(),
  validateXlsx: jest.fn(),
  validateCsv: jest.fn(),
  processImport: jest.fn(),
};

const mockYearGroupGradeWeightsService = {
  upsert: jest.fn(),
  findByYearGroup: jest.fn(),
  copyFromYearGroup: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

const mockStaffProfileFacade = { findByUserId: jest.fn() };
const mockClassesFacade = { findClassesByStaff: jest.fn() };

const mockPrisma = {
  classStaff: { findMany: jest.fn() },
  staffProfile: { findFirst: jest.fn() },
  periodGradeSnapshot: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  assessment: { findFirst: jest.fn() },
  classEnrolment: { findMany: jest.fn() },
  grade: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

describe('GradebookController', () => {
  let controller: GradebookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradebookController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
        { provide: AssessmentsService, useValue: mockAssessmentsService },
        { provide: GradesService, useValue: mockGradesService },
        { provide: PeriodGradeComputationService, useValue: mockPeriodGradeComputationService },
        { provide: ResultsMatrixService, useValue: mockResultsMatrixService },
        { provide: BulkImportService, useValue: mockBulkImportService },
        { provide: YearGroupGradeWeightsService, useValue: mockYearGroupGradeWeightsService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GradebookController>(GradebookController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Grade Configs ──────────────────────────────────────────────────────

  it('should upsert a grade config for a class/subject pair', async () => {
    const dto = {
      grading_scale_id: 'scale-id',
      category_weight_json: { weights: [{ category_id: 'cat-1', weight: 100 }] },
    };
    const upserted = { id: 'cfg-id', class_id: CLASS_ID, subject_id: SUBJECT_ID };
    mockClassGradeConfigsService.upsert.mockResolvedValue(upserted);

    const result = await controller.upsertGradeConfig(tenantContext, CLASS_ID, SUBJECT_ID, dto);

    expect(result).toEqual(upserted);
    expect(mockClassGradeConfigsService.upsert).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      SUBJECT_ID,
      dto,
    );
  });

  it('should return grade configs for a class', async () => {
    const configs = [{ id: 'cfg-1', class_id: CLASS_ID }];
    mockClassGradeConfigsService.findByClass.mockResolvedValue(configs);

    const result = await controller.findGradeConfigsByClass(tenantContext, CLASS_ID);

    expect(result).toEqual(configs);
    expect(mockClassGradeConfigsService.findByClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
  });

  it('should delete a grade config for a class/subject pair', async () => {
    mockClassGradeConfigsService.delete.mockResolvedValue({ deleted: true });

    await controller.deleteGradeConfig(tenantContext, CLASS_ID, SUBJECT_ID);

    expect(mockClassGradeConfigsService.delete).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      SUBJECT_ID,
    );
  });

  // ─── Assessments ────────────────────────────────────────────────────────

  it('should create an assessment and return the new record', async () => {
    const dto = {
      title: 'Mid-term',
      class_id: CLASS_ID,
      subject_id: SUBJECT_ID,
      academic_period_id: PERIOD_ID,
      category_id: CATEGORY_ID,
      max_score: 100,
      counts_toward_report_card: true,
    };
    const created = { id: ASSESSMENT_ID, ...dto };
    mockAssessmentsService.create.mockResolvedValue(created);

    const result = await controller.createAssessment(tenantContext, userContext, dto);

    expect(result).toEqual(created);
    expect(mockAssessmentsService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should list assessments filtered to assigned classes when user lacks gradebook.manage', async () => {
    const permissions = ['gradebook.enter_grades'];
    const staffProfileId = 'sp-id';
    const assignedClasses = [{ class_id: CLASS_ID }];

    mockPermissionCacheService.getPermissions.mockResolvedValue(permissions);
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: staffProfileId });
    mockClassesFacade.findClassesByStaff.mockResolvedValue(assignedClasses);
    mockAssessmentsService.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    const query = { page: 1, pageSize: 20 };
    const result = await controller.findAllAssessments(tenantContext, userContext, query);

    expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    expect(mockAssessmentsService.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ assignedClassIds: [CLASS_ID] }),
    );
  });

  it('should list all assessments without class filter when user has gradebook.manage', async () => {
    const permissions = ['gradebook.manage'];

    mockPermissionCacheService.getPermissions.mockResolvedValue(permissions);
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: 'sp-id' });
    mockAssessmentsService.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    const query = { page: 1, pageSize: 20 };
    await controller.findAllAssessments(tenantContext, userContext, query);

    expect(mockAssessmentsService.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ assignedClassIds: undefined }),
    );
  });

  it('should return a single assessment by id', async () => {
    const assessment = { id: ASSESSMENT_ID, title: 'Mid-term' };
    mockAssessmentsService.findOne.mockResolvedValue(assessment);

    const result = await controller.findOneAssessment(tenantContext, ASSESSMENT_ID);

    expect(result).toEqual(assessment);
    expect(mockAssessmentsService.findOne).toHaveBeenCalledWith(TENANT_ID, ASSESSMENT_ID);
  });

  it('should delete an assessment and delegate to the service', async () => {
    mockAssessmentsService.delete.mockResolvedValue({ deleted: true });

    await controller.deleteAssessment(tenantContext, ASSESSMENT_ID);

    expect(mockAssessmentsService.delete).toHaveBeenCalledWith(TENANT_ID, ASSESSMENT_ID);
  });

  // ─── Grades ─────────────────────────────────────────────────────────────

  it('should bulk upsert grades for an assessment', async () => {
    const dto = {
      grades: [{ student_id: 'st-id', raw_score: 85, is_missing: false, comment: null }],
    };
    const upserted = { data: [{ id: 'grade-1' }] };
    mockGradesService.bulkUpsert.mockResolvedValue(upserted);

    const result = await controller.bulkUpsertGrades(
      tenantContext,
      userContext,
      ASSESSMENT_ID,
      dto,
    );

    expect(result).toEqual(upserted);
    expect(mockGradesService.bulkUpsert).toHaveBeenCalledWith(
      TENANT_ID,
      ASSESSMENT_ID,
      USER_ID,
      dto,
    );
  });

  it('should return grades for an assessment', async () => {
    const grades = [{ id: 'grade-1', raw_score: 90 }];
    mockGradesService.findByAssessment.mockResolvedValue(grades);

    const result = await controller.findGradesByAssessment(tenantContext, ASSESSMENT_ID);

    expect(result).toEqual(grades);
    expect(mockGradesService.findByAssessment).toHaveBeenCalledWith(TENANT_ID, ASSESSMENT_ID);
  });

  // ─── Period Grades ──────────────────────────────────────────────────────

  it('should compute period grades and return the result', async () => {
    const computed = { computed: 10, skipped: 0 };
    mockPeriodGradeComputationService.compute.mockResolvedValue(computed);

    const dto = { class_id: CLASS_ID, subject_id: SUBJECT_ID, academic_period_id: PERIOD_ID };
    const result = await controller.computePeriodGrades(tenantContext, dto);

    expect(result).toEqual(computed);
    expect(mockPeriodGradeComputationService.compute).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      SUBJECT_ID,
      PERIOD_ID,
    );
  });

  it('should return period grades for a class/subject/period query', async () => {
    const snapshots = [{ id: SNAPSHOT_ID, student_id: 'st-1' }];
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(snapshots);

    const query = { class_id: CLASS_ID, subject_id: SUBJECT_ID, academic_period_id: PERIOD_ID };
    const result = await controller.findPeriodGrades(tenantContext, query);

    expect(result).toEqual({ data: snapshots });
  });

  it('should throw NotFoundException when overriding a period grade that does not exist', async () => {
    mockPrisma.periodGradeSnapshot.findFirst.mockResolvedValue(null);

    const dto = { overridden_value: '75', override_reason: 'Medical exemption' };

    await expect(
      controller.overridePeriodGrade(tenantContext, userContext, SNAPSHOT_ID, dto),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── Results Matrix ────────────────────────────────────────────────────

  it('should return results matrix for a class and period', async () => {
    const matrix = { rows: [] };
    mockResultsMatrixService.getMatrix.mockResolvedValue(matrix);

    const result = await controller.getResultsMatrix(tenantContext, CLASS_ID, PERIOD_ID);

    expect(result).toEqual(matrix);
    expect(mockResultsMatrixService.getMatrix).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, PERIOD_ID);
  });

  it('should save results matrix and return the saved data', async () => {
    const dto = {
      grades: [
        { assessment_id: ASSESSMENT_ID, student_id: 'st-1', raw_score: 88, is_missing: false },
      ],
    };
    const saved = { saved: 1 };
    mockResultsMatrixService.saveMatrix.mockResolvedValue(saved);

    const result = await controller.saveResultsMatrix(tenantContext, userContext, CLASS_ID, dto);

    expect(result).toEqual(saved);
    expect(mockResultsMatrixService.saveMatrix).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      USER_ID,
      dto.grades,
    );
  });

  // ─── Import ─────────────────────────────────────────────────────────────

  it('should throw BadRequestException when validating import with no file', async () => {
    await expect(controller.validateImport(tenantContext, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should generate an import template and return the result', async () => {
    const template = { url: 'https://example.com/template.xlsx' };
    mockBulkImportService.generateTemplate.mockResolvedValue(template);

    const result = await controller.downloadImportTemplate(tenantContext, CLASS_ID, PERIOD_ID);

    expect(result).toEqual(template);
    expect(mockBulkImportService.generateTemplate).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      PERIOD_ID,
    );
  });
});
