import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { ClassGradeConfigsService } from '../class-grade-configs.service';

import { AssessmentsService } from './assessments.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CATEGORY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  assessment: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
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
    class: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    assessmentCategory: { findFirst: jest.fn() },
    classSubjectGradeConfig: { findFirst: jest.fn() },
    assessment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    grade: { count: jest.fn(), findFirst: jest.fn() },
    classEnrolment: { count: jest.fn() },
  };
}

const mockClassGradeConfigsService = {
  upsert: jest.fn(),
  findByClass: jest.fn(),
};

const baseAssessment = {
  id: ASSESSMENT_ID,
  tenant_id: TENANT_ID,
  class_id: CLASS_ID,
  subject_id: SUBJECT_ID,
  academic_period_id: PERIOD_ID,
  category_id: CATEGORY_ID,
  title: 'Math Quiz 1',
  max_score: 100,
  due_date: null,
  grading_deadline: null,
  status: 'draft',
  created_at: new Date('2025-10-01'),
  updated_at: new Date('2025-10-01'),
  class_entity: { id: CLASS_ID, name: '5A' },
  subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
  academic_period: { id: PERIOD_ID, name: 'Term 1' },
  category: { id: CATEGORY_ID, name: 'Quiz' },
  _count: { grades: 0 },
};

const validCreateDto = {
  class_id: CLASS_ID,
  subject_id: SUBJECT_ID,
  academic_period_id: PERIOD_ID,
  category_id: CATEGORY_ID,
  title: 'Math Quiz 1',
  max_score: 100,
  counts_toward_report_card: true,
};

// ─── create ───────────────────────────────────────────────────────────────────

describe('AssessmentsService — create', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessment.create.mockReset().mockResolvedValue(baseAssessment);

    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID, subject_type: 'academic' });
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({ id: PERIOD_ID });
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue({ id: CATEGORY_ID });
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({ id: 'config-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when class does not exist', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when subject does not exist', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue(null);

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when subject is not academic', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID, subject_type: 'non_academic' });

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when academic period does not exist', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when category does not exist', async () => {
    mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when no grade config exists for class+subject', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

    await expect(service.create(TENANT_ID, USER_ID, validCreateDto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should create assessment with draft status and correct tenant_id', async () => {
    await service.create(TENANT_ID, USER_ID, validCreateDto);

    expect(mockRlsTx.assessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          title: 'Math Quiz 1',
          status: 'draft',
        }),
      }),
    );
  });
});

// ─── findAll ──────────────────────────────────────────────────────────────────

describe('AssessmentsService — findAll', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated assessments with max_score as number', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([baseAssessment]);
    mockPrisma.assessment.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(typeof result.data[0]?.max_score).toBe('number');
  });

  it('should return empty result when teacher has no assigned classes and requests specific unassigned class', async () => {
    const result = await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      class_id: CLASS_ID,
      assignedClassIds: ['other-class'],
    });

    expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  it('should filter by assignedClassIds when teacher has no specific class_id filter', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.assessment.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      assignedClassIds: [CLASS_ID],
    });

    expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class_id: { in: [CLASS_ID] } }),
      }),
    );
  });

  it('should apply skip based on page number', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockPrisma.assessment.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 2, pageSize: 10 });

    expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});

// ─── findOne ──────────────────────────────────────────────────────────────────

describe('AssessmentsService — findOne', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return assessment with grade_count and student_count', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.grade.count.mockResolvedValue(15);
    mockPrisma.classEnrolment.count.mockResolvedValue(25);

    const result = await service.findOne(TENANT_ID, ASSESSMENT_ID);

    expect(result.id).toBe(ASSESSMENT_ID);
    expect(result.grade_count).toBe(15);
    expect(result.student_count).toBe(25);
    expect(typeof result.max_score).toBe('number');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('AssessmentsService — update', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessment.update.mockReset().mockResolvedValue(baseAssessment);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, ASSESSMENT_ID, { title: 'New Title' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is locked', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      status: 'locked',
    });

    await expect(
      service.update(TENANT_ID, ASSESSMENT_ID, { title: 'New Title' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException on optimistic concurrency mismatch', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      status: 'draft',
      updated_at: new Date('2025-10-01T10:00:00.000Z'),
    });

    await expect(
      service.update(TENANT_ID, ASSESSMENT_ID, {
        title: 'New Title',
        expected_updated_at: '2025-10-01T09:00:00.000Z',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException when new max_score is below an existing grade', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ ...baseAssessment, status: 'open' });
    mockPrisma.grade.findFirst.mockResolvedValue({ raw_score: 95 });

    await expect(
      service.update(TENANT_ID, ASSESSMENT_ID, { max_score: 80 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should update title successfully on a draft assessment', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ ...baseAssessment, status: 'draft' });
    mockPrisma.grade.findFirst.mockResolvedValue(null);

    await service.update(TENANT_ID, ASSESSMENT_ID, { title: 'Updated Title' });

    expect(mockRlsTx.assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSESSMENT_ID },
        data: expect.objectContaining({ title: 'Updated Title' }),
      }),
    );
  });
});

// ─── transitionStatus ─────────────────────────────────────────────────────────

describe('AssessmentsService — transitionStatus', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessment.update.mockReset().mockResolvedValue({ ...baseAssessment, status: 'open' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.transitionStatus(TENANT_ID, ASSESSMENT_ID, { status: 'open' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should transition from draft to open', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, status: 'draft' });

    await service.transitionStatus(TENANT_ID, ASSESSMENT_ID, { status: 'open' });

    expect(mockRlsTx.assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSESSMENT_ID },
        data: { status: 'open' },
      }),
    );
  });

  it('should throw BadRequestException for locked -> anything transition', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, status: 'locked' });

    await expect(
      service.transitionStatus(TENANT_ID, ASSESSMENT_ID, { status: 'open' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for draft -> closed (invalid transition)', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, status: 'draft' });

    await expect(
      service.transitionStatus(TENANT_ID, ASSESSMENT_ID, { status: 'closed' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should allow closed -> open (reopen)', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, status: 'closed' });
    mockRlsTx.assessment.update.mockResolvedValue({ ...baseAssessment, status: 'open' });

    await service.transitionStatus(TENANT_ID, ASSESSMENT_ID, { status: 'open' });

    expect(mockRlsTx.assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'open' } }),
    );
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe('AssessmentsService — delete', () => {
  let service: AssessmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessment.delete.mockReset().mockResolvedValue(baseAssessment);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassGradeConfigsService, useValue: mockClassGradeConfigsService },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(service.delete(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is not draft', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ ...baseAssessment, status: 'open' });

    await expect(service.delete(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException when assessment has grades', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ ...baseAssessment, status: 'draft' });
    mockPrisma.grade.count.mockResolvedValue(5);

    await expect(service.delete(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(ConflictException);
  });

  it('should delete assessment when draft and no grades', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ ...baseAssessment, status: 'draft' });
    mockPrisma.grade.count.mockResolvedValue(0);

    await service.delete(TENANT_ID, ASSESSMENT_ID);

    expect(mockRlsTx.assessment.delete).toHaveBeenCalledWith({ where: { id: ASSESSMENT_ID } });
  });
});
