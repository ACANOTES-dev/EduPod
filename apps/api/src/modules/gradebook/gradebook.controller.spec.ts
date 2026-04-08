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
import { TeacherGradingWeightsService } from './teacher-grading-weights.service';
import { TeachingAllocationsService } from './teaching-allocations.service';
import { UnlockRequestService } from './unlock-request.service';
import { WeightConfigService } from './weight-config.service';
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
  computeCrossSubject: jest.fn(),
  computeCrossPeriod: jest.fn(),
  computeYearOverview: jest.fn(),
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

const mockTeachingAllocationsService = {
  getMyAllocations: jest.fn(),
  getAllAllocations: jest.fn(),
  getClassAllocations: jest.fn(),
};

const mockTeacherGradingWeightsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  submitForApproval: jest.fn(),
  review: jest.fn(),
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
        { provide: TeachingAllocationsService, useValue: mockTeachingAllocationsService },
        { provide: TeacherGradingWeightsService, useValue: mockTeacherGradingWeightsService },
        {
          provide: WeightConfigService,
          useValue: {
            getSubjectWeights: jest.fn(),
            upsertSubjectWeights: jest.fn(),
            getPeriodWeights: jest.fn(),
            upsertPeriodWeights: jest.fn(),
            propagateSubjectWeightsToClasses: jest.fn(),
            propagatePeriodWeightsToClasses: jest.fn(),
          },
        },
        {
          provide: UnlockRequestService,
          useValue: {
            create: jest.fn(),
            findPending: jest.fn(),
            findByAssessment: jest.fn(),
            review: jest.fn(),
          },
        },
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

  // ─── Import validation branches ────────────────────────────────────────

  it('should use validateXlsx when file extension is .xlsx', async () => {
    const validated = { valid: true, rows: 10 };
    mockBulkImportService.validateXlsx.mockResolvedValue(validated);

    const file = {
      buffer: Buffer.from('fake-xlsx'),
      originalname: 'grades.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1024,
    };

    const result = await controller.validateImport(tenantContext, file);

    expect(mockBulkImportService.validateXlsx).toHaveBeenCalledWith(TENANT_ID, file.buffer);
    expect(result).toEqual(validated);
  });

  it('should use validateXlsx when file extension is .xls', async () => {
    const validated = { valid: true, rows: 5 };
    mockBulkImportService.validateXlsx.mockResolvedValue(validated);

    const file = {
      buffer: Buffer.from('fake-xls'),
      originalname: 'grades.xls',
      mimetype: 'application/vnd.ms-excel',
      size: 512,
    };

    const result = await controller.validateImport(tenantContext, file);

    expect(mockBulkImportService.validateXlsx).toHaveBeenCalledWith(TENANT_ID, file.buffer);
    expect(result).toEqual(validated);
  });

  it('should use validateCsv when file extension is .csv', async () => {
    const validated = { valid: true, rows: 3 };
    mockBulkImportService.validateCsv.mockResolvedValue(validated);

    const file = {
      buffer: Buffer.from('csv-data'),
      originalname: 'grades.csv',
      mimetype: 'text/csv',
      size: 256,
    };

    const result = await controller.validateImport(tenantContext, file);

    expect(mockBulkImportService.validateCsv).toHaveBeenCalledWith(TENANT_ID, file.buffer);
    expect(result).toEqual(validated);
  });

  it('should use validateCsv as fallback when extension is unrecognized', async () => {
    const validated = { valid: false, errors: [] };
    mockBulkImportService.validateCsv.mockResolvedValue(validated);

    const file = {
      buffer: Buffer.from('unknown-data'),
      originalname: 'grades.txt',
      mimetype: 'text/plain',
      size: 128,
    };

    const result = await controller.validateImport(tenantContext, file);

    expect(mockBulkImportService.validateCsv).toHaveBeenCalledWith(TENANT_ID, file.buffer);
    expect(result).toEqual(validated);
  });

  it('should process an import and delegate to the bulk import service', async () => {
    const processed = { imported: 20, errors: [] };
    mockBulkImportService.processImport.mockResolvedValue(processed);

    const dto = {
      rows: [
        {
          student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
          assessment_id: ASSESSMENT_ID,
          score: 85,
        },
      ],
    };
    const result = await controller.processImport(tenantContext, userContext, dto);

    expect(mockBulkImportService.processImport).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto.rows);
    expect(result).toEqual(processed);
  });

  // ─── Period Grades extra branches ──────────────────────────────────────

  it('should return student period grades for a specific student', async () => {
    const snapshots = [{ id: SNAPSHOT_ID, subject: { name: 'Math' } }];
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(snapshots);

    const result = await controller.findStudentPeriodGrades(tenantContext, 'student-123');

    expect(result).toEqual({ data: snapshots });
    expect(mockPrisma.periodGradeSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student_id: 'student-123' }),
      }),
    );
  });

  // ─── Assessment status transition ──────────────────────────────────────

  it('should transition assessment status', async () => {
    const transitioned = { id: ASSESSMENT_ID, status: 'submitted_locked' };
    mockAssessmentsService.transitionStatus.mockResolvedValue(transitioned);

    const dto = { status: 'submitted_locked' as const };
    const result = await controller.transitionAssessmentStatus(tenantContext, ASSESSMENT_ID, dto);

    expect(result).toEqual(transitioned);
    expect(mockAssessmentsService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      ASSESSMENT_ID,
      dto,
    );
  });

  it('should update an assessment', async () => {
    const updated = { id: ASSESSMENT_ID, title: 'Updated Assessment' };
    mockAssessmentsService.update.mockResolvedValue(updated);

    const dto = { title: 'Updated Assessment' };
    const result = await controller.updateAssessment(tenantContext, ASSESSMENT_ID, dto);

    expect(result).toEqual(updated);
    expect(mockAssessmentsService.update).toHaveBeenCalledWith(TENANT_ID, ASSESSMENT_ID, dto);
  });

  // ─── findAllAssessments edge cases ─────────────────────────────────────

  it('should handle user with no membership_id (empty permissions)', async () => {
    const userNoMembership = { ...userContext, membership_id: undefined };
    mockStaffProfileFacade.findByUserId.mockResolvedValue(null);
    mockAssessmentsService.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    const query = { page: 1, pageSize: 20 };
    await controller.findAllAssessments(tenantContext, userNoMembership as never, query);

    // No membership_id means empty permissions, assignedClassIds should be undefined
    // because staffProfileId will be undefined
    expect(mockAssessmentsService.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ assignedClassIds: undefined }),
    );
  });

  it('should find grade config for a class/subject pair', async () => {
    const config = { id: 'cfg-1', grading_scale_id: 'scale-1' };
    mockClassGradeConfigsService.findOne.mockResolvedValue(config);

    const result = await controller.findOneGradeConfig(tenantContext, CLASS_ID, SUBJECT_ID);

    expect(result).toEqual(config);
    expect(mockClassGradeConfigsService.findOne).toHaveBeenCalledWith(
      TENANT_ID,
      CLASS_ID,
      SUBJECT_ID,
    );
  });

  // ─── Year Group Grade Weights ──────────────────────────────────────────

  it('should upsert year group grade weights', async () => {
    const dto = {
      year_group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
      academic_period_id: PERIOD_ID,
      category_weights: [{ category_id: CATEGORY_ID, weight: 100 }],
    };
    const upserted = { id: 'w-1', ...dto };
    mockYearGroupGradeWeightsService.upsert.mockResolvedValue(upserted);

    const result = await controller.upsertYearGroupGradeWeight(tenantContext, dto);

    expect(result).toEqual(upserted);
    expect(mockYearGroupGradeWeightsService.upsert).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should find year group grade weights', async () => {
    const weights = [{ id: 'w-1' }];
    mockYearGroupGradeWeightsService.findByYearGroup.mockResolvedValue(weights);

    const result = await controller.findYearGroupGradeWeights(tenantContext, 'yg-1');

    expect(result).toEqual(weights);
    expect(mockYearGroupGradeWeightsService.findByYearGroup).toHaveBeenCalledWith(
      TENANT_ID,
      'yg-1',
    );
  });

  it('should copy year group grade weights', async () => {
    const copied = { copied: 5 };
    mockYearGroupGradeWeightsService.copyFromYearGroup.mockResolvedValue(copied);

    const dto = { source_year_group_id: 'yg-1', target_year_group_id: 'yg-2' };
    const result = await controller.copyYearGroupGradeWeights(tenantContext, dto);

    expect(result).toEqual(copied);
    expect(mockYearGroupGradeWeightsService.copyFromYearGroup).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  // ─── Download Import Template ──────────────────────────────────────────

  it('should generate import template with no class_id and period_id', async () => {
    const template = { url: 'https://example.com/template.xlsx' };
    mockBulkImportService.generateTemplate.mockResolvedValue(template);

    const result = await controller.downloadImportTemplate(tenantContext, undefined, undefined);

    expect(result).toEqual(template);
    expect(mockBulkImportService.generateTemplate).toHaveBeenCalledWith(
      TENANT_ID,
      undefined,
      undefined,
    );
  });
});
