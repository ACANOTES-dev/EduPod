import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ClassesReadFacade, AcademicReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { AssessmentTemplateService } from './assessment-template.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const TEMPLATE_ID = 'template-1';
const CATEGORY_ID = 'cat-1';
const SUBJECT_ID = 'subject-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  assessmentTemplate: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assessment: { create: jest.fn() },
  assessmentStandardMapping: { createMany: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    assessmentCategory: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    rubricTemplate: { findFirst: jest.fn() },
    assessmentTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    class: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    classSubjectGradeConfig: { findFirst: jest.fn() },
    curriculumStandard: { findMany: jest.fn() },
  };
}

const baseTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Quiz Template',
  subject_id: SUBJECT_ID,
  category_id: CATEGORY_ID,
  max_score: 100,
  rubric_template_id: null,
  standard_ids_json: null,
  counts_toward_report_card: true,
  created_by_user_id: USER_ID,
  subject: { id: SUBJECT_ID, name: 'Math' },
  category: { id: CATEGORY_ID, name: 'Quiz' },
  rubric_template: null,
  created_by: { id: USER_ID, first_name: 'Ali', last_name: 'Hassan' },
};

// ─── create Tests ─────────────────────────────────────────────────────────────

describe('AssessmentTemplateService — create', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockAcademicFacadeForCreate = { findSubjectByIdOrThrow: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.assessmentTemplate.create.mockReset().mockResolvedValue(baseTemplate);

    mockPrisma.assessmentCategory.findFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockAcademicFacadeForCreate.findSubjectByIdOrThrow.mockResolvedValue({ id: SUBJECT_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: mockAcademicFacadeForCreate },
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when category does not exist', async () => {
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.create(TENANT_ID, USER_ID, {
        name: 'Quiz',
        category_id: CATEGORY_ID,
        max_score: 100,
        counts_toward_report_card: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when subject does not exist', async () => {
    mockAcademicFacadeForCreate.findSubjectByIdOrThrow.mockRejectedValue(new NotFoundException('subject not found'));

    await expect(
      service.create(TENANT_ID, USER_ID, {
        name: 'Quiz',
        category_id: CATEGORY_ID,
        subject_id: SUBJECT_ID,
        max_score: 100,
        counts_toward_report_card: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should create a template with correct tenant_id and creator', async () => {
    await service.create(TENANT_ID, USER_ID, {
      name: 'Quiz Template',
      category_id: CATEGORY_ID,
      max_score: 100,
      counts_toward_report_card: true,
    });

    expect(mockRlsTx.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Quiz Template',
          created_by_user_id: USER_ID,
        }),
      }),
    );
  });
});

// ─── list Tests ───────────────────────────────────────────────────────────────

describe('AssessmentTemplateService — list', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated template list with max_score as number', async () => {
    mockPrisma.assessmentTemplate.findMany.mockResolvedValue([
      { ...baseTemplate, max_score: { toNumber: () => 100, toString: () => '100' } },
    ]);
    mockPrisma.assessmentTemplate.count.mockResolvedValue(1);

    const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(typeof result.data[0]?.max_score).toBe('number');
  });
});

// ─── findOne Tests ────────────────────────────────────────────────────────────

describe('AssessmentTemplateService — findOne', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return template with max_score as number', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(baseTemplate);

    const result = await service.findOne(TENANT_ID, TEMPLATE_ID);

    expect(result.id).toBe(TEMPLATE_ID);
    expect(typeof result.max_score).toBe('number');
  });
});

// ─── delete Tests ─────────────────────────────────────────────────────────────

describe('AssessmentTemplateService — delete', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.assessmentTemplate.delete.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.delete(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete template when found', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });

    await service.delete(TENANT_ID, TEMPLATE_ID);

    expect(mockRlsTx.assessmentTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });
  });
});

// ─── createAssessmentFromTemplate Tests ──────────────────────────────────────

describe('AssessmentTemplateService — createAssessmentFromTemplate', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockClassesFacade = { findById: jest.fn() };
  const mockAcademicFacade = { findPeriodById: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.assessment.create.mockReset().mockResolvedValue({ id: 'new-assessment' });
    mockRlsTx.assessmentStandardMapping.createMany.mockReset().mockResolvedValue({ count: 0 });

    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(baseTemplate);
    mockClassesFacade.findById.mockResolvedValue({ id: 'class-1', subject_id: SUBJECT_ID });
    mockAcademicFacade.findPeriodById.mockResolvedValue({ id: 'period-1' });
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({ id: 'config-1' });
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
        class_id: 'class-1',
        academic_period_id: 'period-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when class does not exist', async () => {
    mockClassesFacade.findById.mockResolvedValue(null);

    await expect(
      service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
        class_id: 'class-1',
        academic_period_id: 'period-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when no grade config exists for class/subject', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
        class_id: 'class-1',
        academic_period_id: 'period-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create assessment from template with 0 standards filtered out', async () => {
    const result = await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    }) as { assessment: { id: string }; standards_filtered_out: number };

    expect(result.assessment.id).toBe('new-assessment');
    expect(result.standards_filtered_out).toBe(0);
  });
});
