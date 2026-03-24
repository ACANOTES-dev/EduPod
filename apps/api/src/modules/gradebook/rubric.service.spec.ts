import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RubricService } from './grading/rubric.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const TEMPLATE_ID = 'template-1';
const GRADE_ID = 'grade-1';
const SUBJECT_ID = 'subject-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  rubricTemplate: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  rubricGrade: {
    upsert: jest.fn(),
  },
  grade: {
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    subject: { findFirst: jest.fn() },
    rubricTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    assessment: { count: jest.fn() },
    grade: { findFirst: jest.fn() },
  };
}

const sampleCriteria = [
  {
    id: 'crit-1',
    name: 'Understanding',
    max_points: 10,
    levels: [
      { label: 'Excellent', points: 10, description: 'Full understanding' },
      { label: 'Good', points: 7, description: 'Good understanding' },
      { label: 'Needs Work', points: 4, description: 'Partial understanding' },
    ],
  },
  {
    id: 'crit-2',
    name: 'Clarity',
    max_points: 5,
    levels: [
      { label: 'Clear', points: 5, description: 'Very clear' },
      { label: 'Unclear', points: 2, description: 'Needs improvement' },
    ],
  },
];

const baseTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Essay Rubric',
  subject_id: null,
  criteria_json: sampleCriteria,
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── createTemplate Tests ─────────────────────────────────────────────────────

describe('RubricService — createTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.rubricTemplate.create.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RubricService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a rubric template without subject', async () => {
    await service.createTemplate(TENANT_ID, USER_ID, {
      name: 'Essay Rubric',
      criteria: sampleCriteria,
    });

    expect(mockRlsTx.rubricTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Essay Rubric',
          created_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should validate subject_id when provided', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });

    await service.createTemplate(TENANT_ID, USER_ID, {
      name: 'Math Rubric',
      criteria: sampleCriteria,
      subject_id: SUBJECT_ID,
    });

    expect(mockPrisma.subject.findFirst).toHaveBeenCalledWith({
      where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
      select: { id: true },
    });
  });

  it('should throw NotFoundException when subject_id does not exist', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue(null);

    await expect(
      service.createTemplate(TENANT_ID, USER_ID, {
        name: 'Math Rubric',
        criteria: sampleCriteria,
        subject_id: 'nonexistent-subject',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── deleteTemplate Tests ─────────────────────────────────────────────────────

describe('RubricService — deleteTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.rubricTemplate.delete.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RubricService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete a template when not in use', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(baseTemplate);
    mockPrisma.assessment.count.mockResolvedValue(0);

    await service.deleteTemplate(TENANT_ID, TEMPLATE_ID);

    expect(mockRlsTx.rubricTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });
  });

  it('should throw ConflictException when template is used by assessments', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(baseTemplate);
    mockPrisma.assessment.count.mockResolvedValue(3);

    await expect(
      service.deleteTemplate(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteTemplate(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── getTemplate Tests ────────────────────────────────────────────────────────

describe('RubricService — getTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RubricService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the template when found', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({
      ...baseTemplate,
      subject: null,
      created_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      _count: { assessments: 0 },
    });

    const result = await service.getTemplate(TENANT_ID, TEMPLATE_ID);

    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.getTemplate(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── listTemplates Tests ──────────────────────────────────────────────────────

describe('RubricService — listTemplates', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RubricService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated templates with total count', async () => {
    mockPrisma.rubricTemplate.findMany.mockResolvedValue([baseTemplate]);
    mockPrisma.rubricTemplate.count.mockResolvedValue(1);

    const result = await service.listTemplates(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(20);
  });

  it('should filter by subject_id when provided', async () => {
    mockPrisma.rubricTemplate.findMany.mockResolvedValue([]);
    mockPrisma.rubricTemplate.count.mockResolvedValue(0);

    await service.listTemplates(TENANT_ID, { page: 1, pageSize: 20, subject_id: SUBJECT_ID });

    expect(mockPrisma.rubricTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject_id: SUBJECT_ID }),
      }),
    );
  });
});

// ─── saveRubricGrades Tests ───────────────────────────────────────────────────

describe('RubricService — saveRubricGrades', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.rubricGrade.upsert.mockReset().mockResolvedValue({});
    mockRlsTx.grade.update.mockReset().mockResolvedValue({
      id: GRADE_ID,
      raw_score: 15,
    });

    // Default: grade with open assessment
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: {
        id: 'assessment-1',
        max_score: 15,
        rubric_template_id: TEMPLATE_ID,
        status: 'open',
      },
    });

    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      criteria_json: sampleCriteria,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RubricService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should compute total raw_score as sum of criteria scores', async () => {
    await service.saveRubricGrades(TENANT_ID, GRADE_ID, {
      rubric_template_id: TEMPLATE_ID,
      criteria_scores: [
        { criterion_id: 'crit-1', level_index: 0, points_awarded: 10 },
        { criterion_id: 'crit-2', level_index: 0, points_awarded: 5 },
      ],
    });

    // Total = 10 + 5 = 15
    expect(mockRlsTx.grade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GRADE_ID },
        data: { raw_score: 15 },
      }),
    );
  });

  it('should upsert each criterion score', async () => {
    await service.saveRubricGrades(TENANT_ID, GRADE_ID, {
      rubric_template_id: TEMPLATE_ID,
      criteria_scores: [
        { criterion_id: 'crit-1', level_index: 0, points_awarded: 10 },
        { criterion_id: 'crit-2', level_index: 0, points_awarded: 5 },
      ],
    });

    expect(mockRlsTx.rubricGrade.upsert).toHaveBeenCalledTimes(2);
  });

  it('should throw NotFoundException when grade does not exist', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue(null);

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [{ criterion_id: 'crit-1', level_index: 0, points_awarded: 10 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is locked', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: {
        id: 'assessment-1',
        max_score: 15,
        rubric_template_id: TEMPLATE_ID,
        status: 'locked',
      },
    });

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [{ criterion_id: 'crit-1', level_index: 0, points_awarded: 10 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when rubric template does not exist', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: 'nonexistent',
        criteria_scores: [{ criterion_id: 'crit-1', level_index: 0, points_awarded: 10 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException for invalid criterion_id', async () => {
    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [
          { criterion_id: 'nonexistent-criterion', level_index: 0, points_awarded: 10 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('edge: zero points awarded results in raw_score of 0', async () => {
    await service.saveRubricGrades(TENANT_ID, GRADE_ID, {
      rubric_template_id: TEMPLATE_ID,
      criteria_scores: [
        { criterion_id: 'crit-1', level_index: 2, points_awarded: 0 },
        { criterion_id: 'crit-2', level_index: 1, points_awarded: 0 },
      ],
    });

    expect(mockRlsTx.grade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { raw_score: 0 },
      }),
    );
  });
});
