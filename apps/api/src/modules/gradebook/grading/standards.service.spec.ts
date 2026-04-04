import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, AcademicReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { StandardsService } from './standards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBJECT_ID = 'subject-1';
const YEAR_GROUP_ID = 'yg-1';
const STANDARD_ID = 'std-1';
const ASSESSMENT_ID = 'assessment-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  curriculumStandard: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assessmentStandardMapping: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  studentCompetencySnapshot: {
    upsert: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    subject: { findFirst: jest.fn() },
    yearGroup: { findFirst: jest.fn() },
    curriculumStandard: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    assessment: { findFirst: jest.fn(), findMany: jest.fn() },
    student: { findFirst: jest.fn() },
    studentCompetencySnapshot: { findMany: jest.fn() },
    competencyScale: { findFirst: jest.fn() },
  };
}

const baseStandard = {
  id: STANDARD_ID,
  tenant_id: TENANT_ID,
  subject_id: SUBJECT_ID,
  year_group_id: YEAR_GROUP_ID,
  code: 'MATH-001',
  description: 'Understand fractions',
};

// ─── createStandard Tests ─────────────────────────────────────────────────────

const mockAcademicFacade = {
  findSubjectByIdOrThrow: jest.fn(),
  findYearGroupByIdOrThrow: jest.fn(),
};

describe('StandardsService — createStandard', () => {
  let service: StandardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.curriculumStandard.create.mockReset().mockResolvedValue(baseStandard);

    mockAcademicFacade.findSubjectByIdOrThrow.mockResolvedValue({ id: SUBJECT_ID });
    mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue({ id: YEAR_GROUP_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        StandardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StandardsService>(StandardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when subject does not exist', async () => {
    mockAcademicFacade.findSubjectByIdOrThrow.mockRejectedValue(new NotFoundException('subject not found'));

    await expect(
      service.createStandard(TENANT_ID, { subject_id: SUBJECT_ID, year_group_id: YEAR_GROUP_ID, code: 'X', description: 'Y' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when year group does not exist', async () => {
    mockAcademicFacade.findYearGroupByIdOrThrow.mockRejectedValue(new NotFoundException('year group not found'));

    await expect(
      service.createStandard(TENANT_ID, { subject_id: SUBJECT_ID, year_group_id: YEAR_GROUP_ID, code: 'X', description: 'Y' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should create standard with correct tenant_id', async () => {
    await service.createStandard(TENANT_ID, {
      subject_id: SUBJECT_ID,
      year_group_id: YEAR_GROUP_ID,
      code: 'MATH-001',
      description: 'Understand fractions',
    });

    expect(mockRlsTx.curriculumStandard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          code: 'MATH-001',
        }),
      }),
    );
  });
});

// ─── listStandards Tests ──────────────────────────────────────────────────────

describe('StandardsService — listStandards', () => {
  let service: StandardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StandardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StandardsService>(StandardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated standards list', async () => {
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([baseStandard]);
    mockPrisma.curriculumStandard.count.mockResolvedValue(1);

    const result = await service.listStandards(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });

  it('should return empty list when no standards exist', async () => {
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([]);
    mockPrisma.curriculumStandard.count.mockResolvedValue(0);

    const result = await service.listStandards(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(0);
  });
});

// ─── deleteStandard Tests ─────────────────────────────────────────────────────

describe('StandardsService — deleteStandard', () => {
  let service: StandardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.curriculumStandard.delete.mockReset().mockResolvedValue(baseStandard);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StandardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StandardsService>(StandardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when standard does not exist', async () => {
    mockPrisma.curriculumStandard.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteStandard(TENANT_ID, STANDARD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete the standard when it exists', async () => {
    mockPrisma.curriculumStandard.findFirst.mockResolvedValue({ id: STANDARD_ID });

    await service.deleteStandard(TENANT_ID, STANDARD_ID);

    expect(mockRlsTx.curriculumStandard.delete).toHaveBeenCalledWith({
      where: { id: STANDARD_ID },
    });
  });
});

// ─── mapAssessmentStandards Tests ─────────────────────────────────────────────

describe('StandardsService — mapAssessmentStandards', () => {
  let service: StandardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.assessmentStandardMapping.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.assessmentStandardMapping.createMany.mockReset().mockResolvedValue({ count: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StandardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StandardsService>(StandardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.mapAssessmentStandards(TENANT_ID, ASSESSMENT_ID, { standard_ids: ['std-1'] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when some standard IDs do not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([{ id: 'std-1' }]);

    await expect(
      service.mapAssessmentStandards(TENANT_ID, ASSESSMENT_ID, { standard_ids: ['std-1', 'std-missing'] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should replace existing mappings with new standard_ids', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
    mockPrisma.curriculumStandard.findMany.mockResolvedValue([
      { id: 'std-1' },
      { id: 'std-2' },
    ]);

    const result = await service.mapAssessmentStandards(TENANT_ID, ASSESSMENT_ID, {
      standard_ids: ['std-1', 'std-2'],
    }) as { mapped_count: number };

    expect(result.mapped_count).toBe(2);
    expect(mockRlsTx.assessmentStandardMapping.deleteMany).toHaveBeenCalled();
    expect(mockRlsTx.assessmentStandardMapping.createMany).toHaveBeenCalled();
  });

  it('should allow clearing all mappings with empty standard_ids', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });

    const result = await service.mapAssessmentStandards(TENANT_ID, ASSESSMENT_ID, { standard_ids: [] }) as { mapped_count: number };

    expect(result.mapped_count).toBe(0);
    expect(mockRlsTx.assessmentStandardMapping.deleteMany).toHaveBeenCalled();
    expect(mockRlsTx.assessmentStandardMapping.createMany).not.toHaveBeenCalled();
  });
});

// ─── computeCompetencySnapshots Tests ────────────────────────────────────────

describe('StandardsService — computeCompetencySnapshots', () => {
  let service: StandardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.studentCompetencySnapshot.upsert.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StandardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StandardsService>(StandardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return snapshots_computed:0 when no assessments with mappings exist', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    const result = await service.computeCompetencySnapshots(TENANT_ID, 'student-1', 'period-1');

    expect(result.snapshots_computed).toBe(0);
  });

  it('should compute Mastered level when score is 95%', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        standard_mappings: [{ standard_id: STANDARD_ID }],
        grades: [{ raw_score: 95 }],
      },
    ]);
    mockPrisma.competencyScale.findFirst.mockResolvedValue({
      levels_json: [
        { label: 'Beginning', threshold_min: 0 },
        { label: 'Developing', threshold_min: 40 },
        { label: 'Proficient', threshold_min: 70 },
        { label: 'Mastered', threshold_min: 90 },
      ],
    });

    const result = await service.computeCompetencySnapshots(TENANT_ID, 'student-1', 'period-1');

    expect(result.snapshots_computed).toBe(1);
    expect(mockRlsTx.studentCompetencySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ competency_level: 'Mastered' }),
      }),
    );
  });

  it('should use default scale levels when no competency scale is configured', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        standard_mappings: [{ standard_id: STANDARD_ID }],
        grades: [{ raw_score: 55 }],
      },
    ]);
    mockPrisma.competencyScale.findFirst.mockResolvedValue(null);

    const result = await service.computeCompetencySnapshots(TENANT_ID, 'student-1', 'period-1');

    expect(result.snapshots_computed).toBe(1);
    expect(mockRlsTx.studentCompetencySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ competency_level: 'Developing' }),
      }),
    );
  });
});
