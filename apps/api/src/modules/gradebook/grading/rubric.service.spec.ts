/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import { PrismaService } from '../../prisma/prisma.service';

import { RubricService } from './rubric.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const TEMPLATE_ID = 'template-1';
const GRADE_ID = 'grade-1';
const SUBJECT_ID = 'subject-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  rubricTemplate: {
    create: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, name: 'Test Rubric' }),
    update: jest.fn().mockResolvedValue({ id: TEMPLATE_ID, name: 'Updated Rubric' }),
    delete: jest.fn().mockResolvedValue({ id: TEMPLATE_ID }),
  },
  rubricGrade: {
    upsert: jest.fn().mockResolvedValue({}),
  },
  grade: {
    update: jest.fn().mockResolvedValue({ id: GRADE_ID, raw_score: 15 }),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    subject: { findFirst: jest.fn() },
    rubricTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    assessment: {
      count: jest.fn(),
    },
    grade: {
      findFirst: jest.fn(),
    },
  };
}

// ─── createTemplate Tests ────────────────────────────────────────────────────

describe('RubricService — createTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.rubricTemplate.create
      .mockReset()
      .mockResolvedValue({ id: TEMPLATE_ID, name: 'Test Rubric' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a rubric template successfully', async () => {
    const result = await service.createTemplate(TENANT_ID, USER_ID, {
      name: 'Test Rubric',
      criteria: [{ id: 'c1', name: 'Clarity', max_points: 10, levels: [] }],
    });

    expect(result.id).toBe(TEMPLATE_ID);
    expect(mockRlsTx.rubricTemplate.create).toHaveBeenCalled();
  });

  it('should throw NotFoundException when subject_id is invalid', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue(null);

    await expect(
      service.createTemplate(TENANT_ID, USER_ID, {
        name: 'Test Rubric',
        subject_id: 'invalid-subject',
        criteria: [],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should validate subject exists when subject_id is provided', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });

    await service.createTemplate(TENANT_ID, USER_ID, {
      name: 'Test Rubric',
      subject_id: SUBJECT_ID,
      criteria: [{ id: 'c1', name: 'Clarity', max_points: 10, levels: [] }],
    });

    expect(mockPrisma.subject.findFirst).toHaveBeenCalledWith({
      where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
      select: { id: true },
    });
  });
});

// ─── updateTemplate Tests ────────────────────────────────────────────────────

describe('RubricService — updateTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.rubricTemplate.update
      .mockReset()
      .mockResolvedValue({ id: TEMPLATE_ID, name: 'Updated' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTemplate(TENANT_ID, TEMPLATE_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should update template name successfully', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });

    const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
      name: 'Updated',
    });

    expect(result.id).toBe(TEMPLATE_ID);
    expect(mockRlsTx.rubricTemplate.update).toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating subject_id to invalid value', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.subject.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTemplate(TENANT_ID, TEMPLATE_ID, { subject_id: 'invalid' }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── deleteTemplate Tests ────────────────────────────────────────────────────

describe('RubricService — deleteTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.rubricTemplate.delete.mockReset().mockResolvedValue({ id: TEMPLATE_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(service.deleteTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when template is in use', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.assessment.count.mockResolvedValue(3);

    await expect(service.deleteTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(ConflictException);
  });

  it('should delete template when not in use', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.assessment.count.mockResolvedValue(0);

    await service.deleteTemplate(TENANT_ID, TEMPLATE_ID);

    expect(mockRlsTx.rubricTemplate.delete).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
  });
});

// ─── listTemplates Tests ─────────────────────────────────────────────────────

describe('RubricService — listTemplates', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated list of templates', async () => {
    mockPrisma.rubricTemplate.findMany.mockResolvedValue([
      {
        id: TEMPLATE_ID,
        name: 'Rubric A',
        subject: null,
        created_by: null,
        _count: { assessments: 2 },
      },
    ]);
    mockPrisma.rubricTemplate.count.mockResolvedValue(1);

    const result = await service.listTemplates(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
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

// ─── getTemplate Tests ───────────────────────────────────────────────────────

describe('RubricService — getTemplate', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(service.getTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return template when found', async () => {
    const template = {
      id: TEMPLATE_ID,
      name: 'Test Rubric',
      subject: null,
      created_by: null,
      _count: { assessments: 0 },
    };
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(template);

    const result = await service.getTemplate(TENANT_ID, TEMPLATE_ID);

    expect(result.id).toBe(TEMPLATE_ID);
  });
});

// ─── saveRubricGrades Tests ──────────────────────────────────────────────────

describe('RubricService — saveRubricGrades', () => {
  let service: RubricService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.rubricGrade.upsert.mockReset().mockResolvedValue({});
    mockRlsTx.grade.update.mockReset().mockResolvedValue({ id: GRADE_ID, raw_score: 15 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RubricService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RubricService>(RubricService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when grade not found', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue(null);

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is not gradeable', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: { id: 'a1', max_score: 100, rubric_template_id: TEMPLATE_ID, status: 'locked' },
    });

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when rubric template not found', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: { id: 'a1', max_score: 100, rubric_template_id: TEMPLATE_ID, status: 'open' },
    });
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: 'bad-id',
        criteria_scores: [],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException for invalid criterion_id', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: { id: 'a1', max_score: 100, rubric_template_id: TEMPLATE_ID, status: 'open' },
    });
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      criteria_json: [{ id: 'c1', name: 'Clarity', max_points: 10, levels: [] }],
    });

    await expect(
      service.saveRubricGrades(TENANT_ID, GRADE_ID, {
        rubric_template_id: TEMPLATE_ID,
        criteria_scores: [{ criterion_id: 'invalid', level_index: 0, points_awarded: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should save rubric grades and update raw_score', async () => {
    mockPrisma.grade.findFirst.mockResolvedValue({
      id: GRADE_ID,
      assessment: { id: 'a1', max_score: 20, rubric_template_id: TEMPLATE_ID, status: 'open' },
    });
    mockPrisma.rubricTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      criteria_json: [
        { id: 'c1', name: 'Clarity', max_points: 10, levels: [] },
        { id: 'c2', name: 'Depth', max_points: 10, levels: [] },
      ],
    });

    const result = await service.saveRubricGrades(TENANT_ID, GRADE_ID, {
      rubric_template_id: TEMPLATE_ID,
      criteria_scores: [
        { criterion_id: 'c1', level_index: 2, points_awarded: 8 },
        { criterion_id: 'c2', level_index: 1, points_awarded: 7 },
      ],
    });

    expect(result.rubric_total).toBe(15);
    expect(result.criteria_saved).toBe(2);
    expect(mockRlsTx.rubricGrade.upsert).toHaveBeenCalledTimes(2);
    expect(mockRlsTx.grade.update).toHaveBeenCalledWith({
      where: { id: GRADE_ID },
      data: { raw_score: 15 },
    });
  });
});
