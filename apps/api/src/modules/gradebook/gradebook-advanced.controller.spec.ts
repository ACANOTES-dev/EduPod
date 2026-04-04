/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { AssessmentTemplateService } from './assessments/assessment-template.service';
import { GradeCurveService } from './assessments/grade-curve.service';
import { GradebookAdvancedController } from './gradebook-advanced.controller';
import { GradesService } from './grades.service';
import { CompetencyScaleService } from './grading/competency-scale.service';
import { GpaService } from './grading/gpa.service';
import { RubricService } from './grading/rubric.service';
import { StandardsService } from './grading/standards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUBRIC_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASSESSMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SCALE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TEMPLATE_ID = '11111111-1111-1111-1111-111111111111';
const STANDARD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

const tenantContext = { tenant_id: TENANT_ID };
const userContext = {
  sub: USER_ID,
  membership_id: '44444444-4444-4444-4444-444444444444',
  email: 'teacher@school.ie',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const mockRubricService = {
  createTemplate: jest.fn(),
  listTemplates: jest.fn(),
  getTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  saveRubricGrades: jest.fn(),
};

const mockStandardsService = {
  createStandard: jest.fn(),
  listStandards: jest.fn(),
  deleteStandard: jest.fn(),
  bulkImportStandards: jest.fn(),
  mapAssessmentStandards: jest.fn(),
  getCompetencySnapshots: jest.fn(),
};

const mockCompetencyScaleService = {
  create: jest.fn(),
  list: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockGpaService = {
  getGpaSnapshot: jest.fn(),
  getCumulativeGpa: jest.fn(),
  computeGpa: jest.fn(),
};

const mockGradeCurveService = {
  applyCurve: jest.fn(),
  undoCurve: jest.fn(),
  getCurveHistory: jest.fn(),
};

const mockAssessmentTemplateService = {
  create: jest.fn(),
  list: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createAssessmentFromTemplate: jest.fn(),
};

const mockGradesService = {
  bulkUpsert: jest.fn(),
};

const mockPrisma = {
  assessment: { findFirst: jest.fn() },
  classEnrolment: { findMany: jest.fn() },
  grade: { findMany: jest.fn() },
};

describe('GradebookAdvancedController', () => {
  let controller: GradebookAdvancedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradebookAdvancedController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: RubricService, useValue: mockRubricService },
        { provide: StandardsService, useValue: mockStandardsService },
        { provide: CompetencyScaleService, useValue: mockCompetencyScaleService },
        { provide: GpaService, useValue: mockGpaService },
        { provide: GradeCurveService, useValue: mockGradeCurveService },
        { provide: AssessmentTemplateService, useValue: mockAssessmentTemplateService },
        { provide: GradesService, useValue: mockGradesService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GradebookAdvancedController>(GradebookAdvancedController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Rubric Templates ───────────────────────────────────────────────────

  it('should list rubric templates for the tenant', async () => {
    const templates = [{ id: RUBRIC_ID, name: 'Essay Rubric' }];
    mockRubricService.listTemplates.mockResolvedValue({ data: templates, meta: { total: 1 } });

    const result = await controller.listRubricTemplates(
      tenantContext,
      { page: 1, pageSize: 20 },
    );

    expect(result).toEqual({ data: templates, meta: { total: 1 } });
    expect(mockRubricService.listTemplates).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
  });

  it('should create a rubric template and return the new record', async () => {
    const dto = {
      name: 'Essay Rubric',
      criteria: [{ id: 'c1', name: 'Content', max_points: 4, levels: [{ label: 'Excellent', points: 4, description: 'Outstanding work' }] }],
    };
    const created = { id: RUBRIC_ID, ...dto };
    mockRubricService.createTemplate.mockResolvedValue(created);

    const result = await controller.createRubricTemplate(tenantContext, userContext, dto);

    expect(result).toEqual(created);
    expect(mockRubricService.createTemplate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should delete a rubric template via the service', async () => {
    mockRubricService.deleteTemplate.mockResolvedValue(undefined);

    await controller.deleteRubricTemplate(tenantContext, RUBRIC_ID);

    expect(mockRubricService.deleteTemplate).toHaveBeenCalledWith(TENANT_ID, RUBRIC_ID);
  });

  // ─── Curriculum Standards ───────────────────────────────────────────────

  it('should list curriculum standards for the tenant', async () => {
    const standards = [{ id: STANDARD_ID, code: 'MAT.1.A' }];
    mockStandardsService.listStandards.mockResolvedValue({ data: standards });

    const result = await controller.listCurriculumStandards(
      tenantContext,
      { page: 1, pageSize: 20 },
    );

    expect(result).toEqual({ data: standards });
    expect(mockStandardsService.listStandards).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
  });

  it('should create a curriculum standard and return the new record', async () => {
    const dto = { code: 'MAT.1.A', description: 'Count to 10', subject_id: 'sub-id', year_group_id: 'yg-id' };
    const created = { id: STANDARD_ID, ...dto };
    mockStandardsService.createStandard.mockResolvedValue(created);

    const result = await controller.createCurriculumStandard(tenantContext, dto);

    expect(result).toEqual(created);
    expect(mockStandardsService.createStandard).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  // ─── Competency Scales ──────────────────────────────────────────────────

  it('should list competency scales for the tenant', async () => {
    const scales = [{ id: SCALE_ID, name: 'Beginning/Developing/Proficient' }];
    mockCompetencyScaleService.list.mockResolvedValue(scales);

    const result = await controller.listCompetencyScales(tenantContext);

    expect(result).toEqual(scales);
    expect(mockCompetencyScaleService.list).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should create a competency scale and return the new record', async () => {
    const dto = {
      name: 'BDP Scale',
      levels: [{ label: 'Beginning', threshold_min: 0 }],
    };
    const created = { id: SCALE_ID, ...dto };
    mockCompetencyScaleService.create.mockResolvedValue(created);

    const result = await controller.createCompetencyScale(tenantContext, dto);

    expect(result).toEqual(created);
    expect(mockCompetencyScaleService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  // ─── GPA ───────────────────────────────────────────────────────────────

  it('should return cumulative GPA when no academic_period_id is provided', async () => {
    const gpa = { cumulative_gpa: 3.75, credits_earned: 60 };
    mockGpaService.getCumulativeGpa.mockResolvedValue(gpa);

    const result = await controller.getStudentGpa(tenantContext, STUDENT_ID, {});

    expect(result).toEqual(gpa);
    expect(mockGpaService.getCumulativeGpa).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
  });

  it('should return period GPA snapshot when academic_period_id is provided', async () => {
    const snapshot = { gpa: 3.5, academic_period_id: PERIOD_ID };
    mockGpaService.getGpaSnapshot.mockResolvedValue(snapshot);

    const result = await controller.getStudentGpa(
      tenantContext,
      STUDENT_ID,
      { academic_period_id: PERIOD_ID },
    );

    expect(result).toEqual(snapshot);
    expect(mockGpaService.getGpaSnapshot).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, PERIOD_ID);
  });

  it('should compute GPA for a student in a period', async () => {
    const computed = { gpa: 3.8, courses: 5 };
    mockGpaService.computeGpa.mockResolvedValue(computed);

    const dto = { student_id: STUDENT_ID, academic_period_id: PERIOD_ID };
    const result = await controller.computeGpa(tenantContext, dto);

    expect(result).toEqual(computed);
    expect(mockGpaService.computeGpa).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, PERIOD_ID);
  });

  // ─── Grade Curve ───────────────────────────────────────────────────────

  it('should apply a grade curve to an assessment', async () => {
    const dto = { method: 'linear_shift' as const, params: { shift: 5 } };
    const applied = { updated: 25 };
    mockGradeCurveService.applyCurve.mockResolvedValue(applied);

    const result = await controller.applyCurve(tenantContext, userContext, ASSESSMENT_ID, dto);

    expect(result).toEqual(applied);
    expect(mockGradeCurveService.applyCurve).toHaveBeenCalledWith(
      TENANT_ID, ASSESSMENT_ID, USER_ID, dto,
    );
  });

  it('should return the curve history for an assessment', async () => {
    const history = [{ id: 'curve-1', curve_type: 'flat', applied_at: '2026-01-01' }];
    mockGradeCurveService.getCurveHistory.mockResolvedValue(history);

    const result = await controller.getCurveHistory(tenantContext, ASSESSMENT_ID);

    expect(result).toEqual(history);
    expect(mockGradeCurveService.getCurveHistory).toHaveBeenCalledWith(TENANT_ID, ASSESSMENT_ID);
  });

  // ─── Assessment Templates ──────────────────────────────────────────────

  it('should list assessment templates for the tenant', async () => {
    const templates = [{ id: TEMPLATE_ID, title: 'Quiz Template' }];
    mockAssessmentTemplateService.list.mockResolvedValue({ data: templates });

    const result = await controller.listAssessmentTemplates(
      tenantContext,
      { page: 1, pageSize: 20 },
    );

    expect(result).toEqual({ data: templates });
    expect(mockAssessmentTemplateService.list).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 1, pageSize: 20 },
    );
  });

  it('should create an assessment from a template', async () => {
    const dto = { class_id: 'cl-id', subject_id: 'sub-id', academic_period_id: PERIOD_ID, date: '2026-04-01' };
    const created = { id: ASSESSMENT_ID, title: 'Quiz from template' };
    mockAssessmentTemplateService.createAssessmentFromTemplate.mockResolvedValue(created);

    const result = await controller.createAssessmentFromTemplate(
      tenantContext, userContext, TEMPLATE_ID, dto,
    );

    expect(result).toEqual(created);
    expect(mockAssessmentTemplateService.createAssessmentFromTemplate).toHaveBeenCalledWith(
      TENANT_ID, TEMPLATE_ID, USER_ID, dto,
    );
  });
});
