import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  AcademicReadFacade,
} from '../../../common/tests/mock-facades';
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
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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
    mockAcademicFacadeForCreate.findSubjectByIdOrThrow.mockRejectedValue(
      new NotFoundException('subject not found'),
    );

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

// ─── create — additional branches ─────────────────────────────────────────────

describe('AssessmentTemplateService — create additional branches', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockAcademicFacade = { findSubjectByIdOrThrow: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessmentTemplate.create.mockReset().mockResolvedValue(baseTemplate);
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockAcademicFacade.findSubjectByIdOrThrow.mockResolvedValue({ id: SUBJECT_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when rubric_template_id does not exist', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.create(TENANT_ID, USER_ID, {
        name: 'Quiz',
        category_id: CATEGORY_ID,
        max_score: 100,
        rubric_template_id: 'bad-rubric',
        counts_toward_report_card: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should create template without subject_id when not provided', async () => {
    await service.create(TENANT_ID, USER_ID, {
      name: 'Quiz',
      category_id: CATEGORY_ID,
      max_score: 100,
      counts_toward_report_card: true,
    });

    expect(mockRlsTx.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject_id: null,
        }),
      }),
    );
    // Subject validation should NOT have been called
    expect(mockAcademicFacade.findSubjectByIdOrThrow).not.toHaveBeenCalled();
  });

  it('should create template with rubric_template_id when rubric exists', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: 'rubric-1' });

    await service.create(TENANT_ID, USER_ID, {
      name: 'Quiz',
      category_id: CATEGORY_ID,
      max_score: 100,
      rubric_template_id: 'rubric-1',
      counts_toward_report_card: true,
    });

    expect(mockRlsTx.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rubric_template_id: 'rubric-1',
        }),
      }),
    );
  });

  it('should default counts_toward_report_card to true when not provided', async () => {
    await service.create(TENANT_ID, USER_ID, {
      name: 'Quiz',
      category_id: CATEGORY_ID,
      max_score: 100,
      counts_toward_report_card: undefined as unknown as boolean,
    });

    expect(mockRlsTx.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          counts_toward_report_card: true,
        }),
      }),
    );
  });

  it('should pass standard_ids as Prisma.JsonNull when not provided', async () => {
    await service.create(TENANT_ID, USER_ID, {
      name: 'Quiz',
      category_id: CATEGORY_ID,
      max_score: 100,
      counts_toward_report_card: true,
    });

    // standard_ids_json should be Prisma.JsonNull (the ?? branch)
    const createCall = mockRlsTx.assessmentTemplate.create.mock.calls[0] as [
      { data: { standard_ids_json: unknown } },
    ];
    // When dto.standard_ids is undefined, it uses Prisma.JsonNull
    expect(createCall[0].data).toHaveProperty('standard_ids_json');
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

  it('should filter by subject_id when provided', async () => {
    mockPrisma.assessmentTemplate.findMany.mockResolvedValue([]);
    mockPrisma.assessmentTemplate.count.mockResolvedValue(0);

    await service.list(TENANT_ID, { page: 1, pageSize: 20, subject_id: SUBJECT_ID });

    expect(mockPrisma.assessmentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          subject_id: SUBJECT_ID,
        }),
      }),
    );
  });

  it('should not include subject_id in where when not provided', async () => {
    mockPrisma.assessmentTemplate.findMany.mockResolvedValue([]);
    mockPrisma.assessmentTemplate.count.mockResolvedValue(0);

    await service.list(TENANT_ID, { page: 1, pageSize: 20 });

    const call = mockPrisma.assessmentTemplate.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).not.toHaveProperty('subject_id');
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

    await expect(service.findOne(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
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

    await expect(service.delete(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
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
    const result = (await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    })) as { assessment: { id: string }; standards_filtered_out: number };

    expect(result.assessment.id).toBe('new-assessment');
    expect(result.standards_filtered_out).toBe(0);
  });

  it('should throw NotFoundException when academic period does not exist', async () => {
    mockAcademicFacade.findPeriodById.mockResolvedValue(null);

    await expect(
      service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
        class_id: 'class-1',
        academic_period_id: 'period-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when no subject can be determined', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      subject_id: null,
    });
    mockClassesFacade.findById.mockResolvedValue({ id: 'class-1', subject_id: null });

    await expect(
      service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
        class_id: 'class-1',
        academic_period_id: 'period-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should use class subject_id when template subject_id is null', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      subject_id: null,
    });
    mockClassesFacade.findById.mockResolvedValue({ id: 'class-1', subject_id: 'class-subject-id' });
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({ id: 'config-1' });

    const result = (await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    })) as { assessment: { id: string } };

    expect(result.assessment.id).toBe('new-assessment');
    expect(mockRlsTx.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject_id: 'class-subject-id' }),
      }),
    );
  });

  it('should filter and map valid standard_ids from template', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      standard_ids_json: ['std-1', 'std-2', 'std-deleted'],
    });
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([{ id: 'std-1' }, { id: 'std-2' }]);

    const result = (await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    })) as { standards_mapped: number; standards_filtered_out: number };

    expect(result.standards_mapped).toBe(2);
    expect(result.standards_filtered_out).toBe(1);
    expect(mockRlsTx.assessmentStandardMapping.createMany).toHaveBeenCalled();
  });

  it('should use dto.title when provided instead of template name', async () => {
    const result = (await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
      title: 'Custom Title',
    })) as { assessment: { id: string } };

    expect(result.assessment.id).toBe('new-assessment');
    expect(mockRlsTx.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Custom Title' }),
      }),
    );
  });

  it('should pass due_date and grading_deadline when provided', async () => {
    await service.createAssessmentFromTemplate(TENANT_ID, TEMPLATE_ID, USER_ID, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
      due_date: '2026-06-01',
      grading_deadline: '2026-06-10',
    });

    expect(mockRlsTx.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          due_date: new Date('2026-06-01'),
          grading_deadline: new Date('2026-06-10'),
        }),
      }),
    );
  });
});

// ─── update Tests ────────────────────────────────────────────────────────────

describe('AssessmentTemplateService — update', () => {
  let service: AssessmentTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockAcademicFacadeForUpdate = { findSubjectByIdOrThrow: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessmentTemplate.update.mockReset().mockResolvedValue({
      ...baseTemplate,
      name: 'Updated',
      max_score: 100,
    });
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: mockAcademicFacadeForUpdate },
        AssessmentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssessmentTemplateService>(AssessmentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.assessmentTemplate.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, TEMPLATE_ID, { name: 'Updated' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when new category_id does not exist', async () => {
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, TEMPLATE_ID, { category_id: 'bad-cat' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when new subject_id does not exist', async () => {
    mockAcademicFacadeForUpdate.findSubjectByIdOrThrow.mockRejectedValue(
      new NotFoundException('subject not found'),
    );

    await expect(
      service.update(TENANT_ID, TEMPLATE_ID, { subject_id: 'bad-subject' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when new rubric_template_id does not exist', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, TEMPLATE_ID, { rubric_template_id: 'bad-rubric' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should update template with all fields when all dto fields provided', async () => {
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue({ id: 'cat-new' });
    mockAcademicFacadeForUpdate.findSubjectByIdOrThrow.mockResolvedValue({ id: 'sub-new' });
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: 'rub-new' });

    await service.update(TENANT_ID, TEMPLATE_ID, {
      name: 'Updated',
      subject_id: 'sub-new',
      category_id: 'cat-new',
      max_score: 200,
      rubric_template_id: 'rub-new',
      standard_ids: ['s1', 's2'],
      counts_toward_report_card: false,
    });

    expect(mockRlsTx.assessmentTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Updated',
          subject_id: 'sub-new',
          category_id: 'cat-new',
          max_score: 200,
          rubric_template_id: 'rub-new',
          counts_toward_report_card: false,
        }),
      }),
    );
  });

  it('should update template with only name when only name is provided', async () => {
    await service.update(TENANT_ID, TEMPLATE_ID, { name: 'Just Name' });

    expect(mockRlsTx.assessmentTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Just Name' }),
      }),
    );
  });

  it('should set standard_ids_json to Prisma.JsonNull when standard_ids is null', async () => {
    await service.update(TENANT_ID, TEMPLATE_ID, {
      standard_ids: null as unknown as string[],
    });

    const updateCall = mockRlsTx.assessmentTemplate.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(updateCall[0].data).toHaveProperty('standard_ids_json');
  });

  it('should set standard_ids_json to array when standard_ids is provided', async () => {
    await service.update(TENANT_ID, TEMPLATE_ID, {
      standard_ids: ['s1', 's2'],
    });

    const updateCall = mockRlsTx.assessmentTemplate.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(updateCall[0].data.standard_ids_json).toEqual(['s1', 's2']);
  });

  it('should update rubric_template_id when provided', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: 'rubric-1' });

    await service.update(TENANT_ID, TEMPLATE_ID, {
      rubric_template_id: 'rubric-1',
    });

    const updateCall = mockRlsTx.assessmentTemplate.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(updateCall[0].data.rubric_template_id).toBe('rubric-1');
  });

  it('should return max_score as a number', async () => {
    mockRlsTx.assessmentTemplate.update.mockResolvedValue({
      ...baseTemplate,
      max_score: 50,
    });

    const result = await service.update(TENANT_ID, TEMPLATE_ID, { name: 'Updated' });

    expect(typeof (result as { max_score: number }).max_score).toBe('number');
  });
});
