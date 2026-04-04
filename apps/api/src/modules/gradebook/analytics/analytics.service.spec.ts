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
