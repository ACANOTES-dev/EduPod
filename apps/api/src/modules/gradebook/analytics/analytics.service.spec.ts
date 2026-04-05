import { Test, TestingModule } from '@nestjs/testing';

import {
  AcademicReadFacade,
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { AnalyticsService } from './analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'assessment-1';
const STUDENT_ID = 'student-1';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subject-1';
const PERIOD_ID = 'period-1';
const YEAR_GROUP_ID = 'yg-1';

/** Creates a mock Decimal-like value that works with Number() */
function decimal(n: number) {
  return { valueOf: () => n, toNumber: () => n, toString: () => String(n) };
}

// ─��─ Helpers ──────────────────────────────────────────��───────────────────────

function buildMockPrisma() {
  return {
    assessment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    grade: {
      findMany: jest.fn(),
    },
    periodGradeSnapshot: {
      findMany: jest.fn(),
    },
    classStaff: {
      findMany: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
  };
}

function buildMockRedis() {
  const mockClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return {
    getClient: jest.fn().mockReturnValue(mockClient),
    _client: mockClient,
  };
}

// ─── getGradeDistribution Tests ──────────────────────────────────────────────

describe('AnalyticsService — getGradeDistribution', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached result if available', async () => {
    const cached = {
      mean: 75,
      median: 76,
      stddev: 5,
      min: 60,
      max: 95,
      passRate: 80,
      count: 10,
      histogram: [],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result).toEqual(cached);
    expect(mockPrisma.assessment.findFirst).not.toHaveBeenCalled();
  });

  it('should return empty distribution when assessment not found', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.histogram).toEqual([]);
  });

  it('should return empty distribution when no grades exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.histogram).toHaveLength(10);
  });

  it('should compute correct mean, median, and pass rate', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    // Scores: 40, 60, 80 => mean = 60, median = 60, passRate = 2/3 * 100 = 66.67
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: decimal(40) },
      { raw_score: decimal(60) },
      { raw_score: decimal(80) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(3);
    expect(result.mean).toBe(60);
    expect(result.median).toBe(60);
    expect(result.min).toBe(40);
    expect(result.max).toBe(80);
    expect(result.passRate).toBe(66.67);
  });

  it('should cache the result after computing', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([{ raw_score: decimal(75) }]);

    await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(mockRedis._client.set).toHaveBeenCalledWith(
      expect.stringContaining('analytics:distribution'),
      expect.any(String),
      'EX',
      300,
    );
  });
});

// ─── getPeriodDistribution Tests ─────────────────────────────────────────────

describe('AnalyticsService — getPeriodDistribution', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should compute distribution from period grade snapshots', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      { computed_value: decimal(70) },
      { computed_value: decimal(80) },
      { computed_value: decimal(90) },
    ]);

    const result = await service.getPeriodDistribution(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.count).toBe(3);
    expect(result.mean).toBe(80);
    expect(result.median).toBe(80);
    expect(result.passRate).toBe(100);
  });

  it('should return empty distribution when no snapshots exist', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const result = await service.getPeriodDistribution(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
  });
});

// ─── getStudentTrend Tests ───────────────────────────────────────────────────

describe('AnalyticsService — getStudentTrend', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return trend points with calculated percentages', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: decimal(80),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: new Date('2026-01-15'),
          max_score: decimal(100),
          subject_id: SUBJECT_ID,
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.percentage).toBe(80);
    expect(result[0]?.raw_score).toBe(80);
    expect(result[0]?.due_date).toBe('2026-01-15');
  });

  it('should return empty array when no grades exist', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([]);

    const result = await service.getStudentTrend(TENANT_ID, STUDENT_ID);

    expect(result).toHaveLength(0);
  });

  it('should filter by subject when subjectId is provided', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: decimal(80),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: new Date('2026-01-15'),
          max_score: decimal(100),
          subject_id: SUBJECT_ID,
        },
      },
      {
        raw_score: decimal(70),
        assessment: {
          id: 'a2',
          title: 'Quiz 2',
          due_date: new Date('2026-01-20'),
          max_score: decimal(100),
          subject_id: 'other-subject',
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, STUDENT_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.assessment_id).toBe('a1');
  });
});

// ─── getClassTrend Tests ─────────────────────────────────────────────────────

describe('AnalyticsService — getClassTrend', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should compute class average per assessment', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        due_date: new Date('2026-01-15'),
        max_score: decimal(100),
        grades: [{ raw_score: decimal(80) }, { raw_score: decimal(60) }],
      },
    ]);

    const result = await service.getClassTrend(TENANT_ID, CLASS_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    // average = (80+60)/2/100 * 100 = 70%
    expect(result[0]?.average).toBe(70);
    expect(result[0]?.count).toBe(2);
  });

  it('should return 0 average when no grades exist for assessment', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        due_date: null,
        max_score: decimal(100),
        grades: [],
      },
    ]);

    const result = await service.getClassTrend(TENANT_ID, CLASS_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.average).toBe(0);
    expect(result[0]?.count).toBe(0);
    expect(result[0]?.due_date).toBeNull();
  });
});

// ─── getTeacherConsistency Tests ─────────────────────────────────────────────

describe('AnalyticsService — getTeacherConsistency', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  const mockClassesFacade = { findClassStaffGeneric: jest.fn() };
  const mockAcademicFacade = { findSubjectsByIds: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when no class staff exist', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([]);

    const result = await service.getTeacherConsistency(TENANT_ID);

    expect(result).toEqual([]);
  });

  it('should compute teacher consistency entries with facade-resolved subject names', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([
      {
        class_id: CLASS_ID,
        staff_profile_id: 'staff-1',
        class_entity: { id: CLASS_ID, name: 'Grade 5A', year_group_id: YEAR_GROUP_ID },
        staff_profile: {
          id: 'staff-1',
          user: { id: 'user-1', first_name: 'John', last_name: 'Doe' },
        },
      },
    ]);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        subject_id: SUBJECT_ID,
        max_score: decimal(100),
        grades: [{ raw_score: decimal(80) }, { raw_score: decimal(60) }],
      },
    ]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([
      { id: SUBJECT_ID, name: 'Math', code: null },
    ]);

    const result = await service.getTeacherConsistency(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.teacher_name).toBe('John Doe');
    expect(result[0]?.class_name).toBe('Grade 5A');
    expect(result[0]?.subject_name).toBe('Math');
    expect(result[0]?.average).toBe(70);
    expect(result[0]?.count).toBe(2);
    expect(result[0]?.flagged).toBe(false);
  });

  it('should flag teachers with >15% deviation from subject mean', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([
      {
        class_id: 'class-a',
        staff_profile_id: 'staff-1',
        class_entity: { id: 'class-a', name: 'Class A', year_group_id: null },
        staff_profile: {
          id: 'staff-1',
          user: { id: 'user-1', first_name: 'Alice', last_name: 'Smith' },
        },
      },
      {
        class_id: 'class-b',
        staff_profile_id: 'staff-2',
        class_entity: { id: 'class-b', name: 'Class B', year_group_id: null },
        staff_profile: {
          id: 'staff-2',
          user: { id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
        },
      },
    ]);

    // Alice: avg 90%, Bob: avg 50% → subject mean = 70%, deviation > 15% for both
    mockPrisma.assessment.findMany
      .mockResolvedValueOnce([
        {
          subject_id: SUBJECT_ID,
          max_score: decimal(100),
          grades: [{ raw_score: decimal(90) }],
        },
      ])
      .mockResolvedValueOnce([
        {
          subject_id: SUBJECT_ID,
          max_score: decimal(100),
          grades: [{ raw_score: decimal(50) }],
        },
      ]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([
      { id: SUBJECT_ID, name: 'Math', code: null },
    ]);

    const result = await service.getTeacherConsistency(TENANT_ID);

    expect(result).toHaveLength(2);
    const alice = result.find((e) => e.teacher_name === 'Alice Smith');
    const bob = result.find((e) => e.teacher_name === 'Bob Jones');
    expect(alice?.flagged).toBe(true);
    expect(bob?.flagged).toBe(true);
  });
});

// ─── getBenchmark Tests ──────────────────────────────────────────────────────

describe('AnalyticsService — getBenchmark', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  const mockClassesFacade = { findByYearGroup: jest.fn() };
  const mockAcademicFacade = {
    findSubjectsByIds: jest.fn(),
    findPeriodsByIds: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when no classes in year group', async () => {
    mockClassesFacade.findByYearGroup.mockResolvedValue([]);

    const result = await service.getBenchmark(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([]);
  });

  it('should group benchmarks by class, subject, and period', async () => {
    mockClassesFacade.findByYearGroup.mockResolvedValue([{ id: CLASS_ID, name: 'Grade 5A' }]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
        computed_value: decimal(75),
      },
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
        computed_value: decimal(85),
      },
    ]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([
      { id: SUBJECT_ID, name: 'Math', code: null },
    ]);
    mockAcademicFacade.findPeriodsByIds.mockResolvedValue([{ id: PERIOD_ID, name: 'Term 1' }]);

    const result = await service.getBenchmark(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.average).toBe(80);
    expect(result[0]?.count).toBe(2);
    expect(result[0]?.class_name).toBe('Grade 5A');
    expect(result[0]?.subject_name).toBe('Math');
    expect(result[0]?.period_name).toBe('Term 1');
  });
});

// ─── invalidateAssessmentCache Tests ─────────────────────────────────────────

describe('AnalyticsService — invalidateAssessmentCache', () => {
  let service: AnalyticsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete the cache key for the assessment', async () => {
    await service.invalidateAssessmentCache(TENANT_ID, ASSESSMENT_ID);

    expect(mockRedis._client.del).toHaveBeenCalledWith(
      `analytics:distribution:${TENANT_ID}:${ASSESSMENT_ID}`,
    );
  });

  it('should not throw when Redis fails', async () => {
    mockRedis._client.del.mockRejectedValue(new Error('Redis down'));

    await expect(
      service.invalidateAssessmentCache(TENANT_ID, ASSESSMENT_ID),
    ).resolves.toBeUndefined();
  });
});

// ─── getGradeDistribution — additional branch coverage ──────────────────────

describe('AnalyticsService — getGradeDistribution (extra branches)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should compute correct median for even number of scores', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    // 4 scores: 40, 60, 70, 90 => median = (60+70)/2 = 65
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: decimal(40) },
      { raw_score: decimal(90) },
      { raw_score: decimal(60) },
      { raw_score: decimal(70) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(4);
    expect(result.median).toBe(65);
    expect(result.min).toBe(40);
    expect(result.max).toBe(90);
  });

  it('should compute correct stddev', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    // Scores: 50, 50 => mean = 50, stddev = 0
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: decimal(50) },
      { raw_score: decimal(50) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.stddev).toBe(0);
    expect(result.mean).toBe(50);
  });

  it('should filter null raw_score values', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([{ raw_score: decimal(80) }, { raw_score: null }]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(1);
    expect(result.mean).toBe(80);
  });
});

// ─── getPeriodDistribution — cache branch ───────────────────────────────────

describe('AnalyticsService — getPeriodDistribution (cache hit)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached result if available', async () => {
    const cached = {
      mean: 80,
      median: 80,
      stddev: 0,
      min: 80,
      max: 80,
      passRate: 100,
      count: 1,
      histogram: [],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getPeriodDistribution(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result).toEqual(cached);
    expect(mockPrisma.periodGradeSnapshot.findMany).not.toHaveBeenCalled();
  });
});

// ─── getStudentTrend — additional branches ──────────────────────────────────

describe('AnalyticsService — getStudentTrend (edge cases)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should handle null due_date on assessment', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: decimal(70),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: null,
          max_score: decimal(100),
          subject_id: SUBJECT_ID,
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, STUDENT_ID);

    expect(result[0]?.due_date).toBeNull();
    expect(result[0]?.percentage).toBe(70);
  });

  it('edge: should handle max_score of 0 (percentage = null)', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: decimal(0),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: null,
          max_score: decimal(0),
          subject_id: SUBJECT_ID,
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, STUDENT_ID);

    expect(result[0]?.percentage).toBeNull();
  });
});

// ─── getClassTrend — additional branches ────────────────────────────────────

describe('AnalyticsService — getClassTrend (with period filter)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should filter by periodId when provided', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    await service.getClassTrend(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academic_period_id: PERIOD_ID }),
      }),
    );
  });

  it('should handle assessments with null raw_score grades', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        due_date: new Date('2026-01-15'),
        max_score: decimal(100),
        grades: [{ raw_score: null }, { raw_score: decimal(80) }],
      },
    ]);

    const result = await service.getClassTrend(TENANT_ID, CLASS_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1); // only non-null grade
    expect(result[0]?.average).toBe(80);
  });
});

// ─── getTeacherConsistency — additional branches ────────────────────────────

describe('AnalyticsService — getTeacherConsistency (cache and yearGroup filter)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  const mockClassesFacade = { findClassStaffGeneric: jest.fn() };
  const mockAcademicFacade = { findSubjectsByIds: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached consistency results', async () => {
    const cached = [{ teacher_id: 'staff-1', flagged: false }];
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getTeacherConsistency(TENANT_ID);

    expect(result).toEqual(cached);
    expect(mockClassesFacade.findClassStaffGeneric).not.toHaveBeenCalled();
  });

  it('should filter by year group', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([
      {
        class_id: 'class-a',
        staff_profile_id: 'staff-1',
        class_entity: { id: 'class-a', name: 'Class A', year_group_id: YEAR_GROUP_ID },
        staff_profile: {
          id: 'staff-1',
          user: { id: 'user-1', first_name: 'Alice', last_name: 'Smith' },
        },
      },
      {
        class_id: 'class-b',
        staff_profile_id: 'staff-2',
        class_entity: { id: 'class-b', name: 'Class B', year_group_id: 'other-yg' },
        staff_profile: {
          id: 'staff-2',
          user: { id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
        },
      },
    ]);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        subject_id: SUBJECT_ID,
        max_score: decimal(100),
        grades: [{ raw_score: decimal(80) }],
      },
    ]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([
      { id: SUBJECT_ID, name: 'Math', code: null },
    ]);

    const result = await service.getTeacherConsistency(TENANT_ID, undefined, YEAR_GROUP_ID);

    // Only Alice (year_group_id matches) should be included
    expect(result).toHaveLength(1);
    expect(result[0]?.teacher_name).toBe('Alice Smith');
  });

  it('should skip class-staff entries with no assessments', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([
      {
        class_id: 'class-a',
        staff_profile_id: 'staff-1',
        class_entity: { id: 'class-a', name: 'Class A', year_group_id: null },
        staff_profile: {
          id: 'staff-1',
          user: { id: 'user-1', first_name: 'Alice', last_name: 'Smith' },
        },
      },
    ]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([]);

    const result = await service.getTeacherConsistency(TENANT_ID);

    expect(result).toEqual([]);
  });
});

// ─── getBenchmark — additional branches ─────────────────────────────────────

describe('AnalyticsService — getBenchmark (cache and filters)', () => {
  let service: AnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  const mockClassesFacade = { findByYearGroup: jest.fn() };
  const mockAcademicFacade = {
    findSubjectsByIds: jest.fn(),
    findPeriodsByIds: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached benchmark results', async () => {
    const cached = [{ class_id: CLASS_ID, average: 80 }];
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getBenchmark(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual(cached);
    expect(mockClassesFacade.findByYearGroup).not.toHaveBeenCalled();
  });

  it('should filter by subjectId and periodId', async () => {
    mockClassesFacade.findByYearGroup.mockResolvedValue([{ id: CLASS_ID, name: 'Grade 5A' }]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([]);
    mockAcademicFacade.findPeriodsByIds.mockResolvedValue([]);

    await service.getBenchmark(TENANT_ID, YEAR_GROUP_ID, SUBJECT_ID, PERIOD_ID);

    expect(mockPrisma.periodGradeSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subject_id: SUBJECT_ID,
          academic_period_id: PERIOD_ID,
        }),
      }),
    );
  });

  it('should handle snapshots with null computed_value', async () => {
    mockClassesFacade.findByYearGroup.mockResolvedValue([{ id: CLASS_ID, name: 'Grade 5A' }]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
        computed_value: null,
      },
    ]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([{ id: SUBJECT_ID, name: 'Math' }]);
    mockAcademicFacade.findPeriodsByIds.mockResolvedValue([{ id: PERIOD_ID, name: 'Term 1' }]);

    const result = await service.getBenchmark(TENANT_ID, YEAR_GROUP_ID);

    // null computed_value is filtered out, so no entries should have data
    expect(result).toEqual([]);
  });
});
