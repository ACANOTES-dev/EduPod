import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AnalyticsService } from './analytics/analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'assessment-1';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subject-1';
const PERIOD_ID = 'period-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDecimal(n: number): Decimal {
  return new Decimal(n);
}

function buildMockPrisma() {
  return {
    assessment: { findFirst: jest.fn(), findMany: jest.fn() },
    grade: { findMany: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    classStaff: { findMany: jest.fn() },
    class: { findMany: jest.fn() },
  };
}

function buildMockRedis(cachedValue: string | null = null) {
  const mockClient = {
    get: jest.fn().mockResolvedValue(cachedValue),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return {
    getClient: jest.fn().mockReturnValue(mockClient),
    _client: mockClient,
  };
}

// ─── Grade Distribution Tests ─────────────────────────────────────────────────

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

  it('should compute mean, median, stddev, min, max, passRate correctly', async () => {
    // Scores: 60, 70, 80, 90 on max_score 100
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: toDecimal(60) },
      { raw_score: toDecimal(70) },
      { raw_score: toDecimal(80) },
      { raw_score: toDecimal(90) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(4);
    expect(result.mean).toBeCloseTo(75, 1);
    expect(result.median).toBeCloseTo(75, 1); // (70+80)/2 = 75
    expect(result.min).toBe(60);
    expect(result.max).toBe(90);
    // pass threshold = 50, all >= 50 → passRate = 100%
    expect(result.passRate).toBe(100);
    // stddev: variance = ((60-75)² + (70-75)² + (80-75)² + (90-75)²) / 4 = (225+25+25+225)/4 = 125; stddev ≈ 11.18
    expect(result.stddev).toBeCloseTo(11.18, 1);
  });

  it('should return zeros when no grades exist (assessment not found)', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.passRate).toBe(0);
  });

  it('should return zeros when assessment exists but no grades', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.count).toBe(0);
  });

  it('should return cached result when cache hit', async () => {
    const cachedResult = {
      mean: 75,
      median: 75,
      stddev: 11.18,
      min: 60,
      max: 90,
      passRate: 100,
      count: 4,
      histogram: [],
    };
    mockRedis = buildMockRedis(JSON.stringify(cachedResult));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.mean).toBe(75);
    expect(mockPrisma.assessment.findFirst).not.toHaveBeenCalled();
  });

  it('should cache the result after computation', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: toDecimal(80) },
    ]);

    await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(mockRedis._client.set).toHaveBeenCalledWith(
      `analytics:distribution:${TENANT_ID}:${ASSESSMENT_ID}`,
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should build histogram with 10 buckets', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: toDecimal(55) },
      { raw_score: toDecimal(65) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.histogram).toHaveLength(10);
    // Score 55 belongs to bucket 50-60 (index 5)
    const bucket50 = result.histogram.find((b) => b.min === 50 && b.max === 60);
    expect(bucket50?.count).toBe(1);
    // Score 65 belongs to bucket 60-70 (index 6)
    const bucket60 = result.histogram.find((b) => b.min === 60 && b.max === 70);
    expect(bucket60?.count).toBe(1);
  });

  it('edge: single score should have stddev of 0', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: toDecimal(75) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    expect(result.stddev).toBe(0);
    expect(result.mean).toBe(75);
    expect(result.median).toBe(75);
    expect(result.min).toBe(75);
    expect(result.max).toBe(75);
  });

  it('edge: median is average of two middle values for even count', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      max_score: 100,
      category: { id: 'cat-1' },
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { raw_score: toDecimal(10) },
      { raw_score: toDecimal(30) },
      { raw_score: toDecimal(50) },
      { raw_score: toDecimal(70) },
    ]);

    const result = await service.getGradeDistribution(TENANT_ID, ASSESSMENT_ID);

    // Sorted: 10, 30, 50, 70 → median = (30+50)/2 = 40
    expect(result.median).toBe(40);
  });
});

// ─── Period Distribution Tests ────────────────────────────────────────────────

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
      { computed_value: toDecimal(70) },
      { computed_value: toDecimal(80) },
      { computed_value: toDecimal(90) },
    ]);

    const result = await service.getPeriodDistribution(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.count).toBe(3);
    expect(result.mean).toBeCloseTo(80, 1);
    expect(result.min).toBe(70);
    expect(result.max).toBe(90);
  });

  it('should return zeros when no snapshots exist', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const result = await service.getPeriodDistribution(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.count).toBe(0);
    expect(result.mean).toBe(0);
  });
});

// ─── Student Trend Tests ──────────────────────────────────────────────────────

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

  it('should compute percentage for each grade', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: toDecimal(75),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: new Date('2026-01-10'),
          max_score: 100,
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Math' },
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, 'student-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.percentage).toBe(75);
    expect(result[0]?.raw_score).toBe(75);
    expect(result[0]?.due_date).toBe('2026-01-10');
  });

  it('should filter by subject_id when provided', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: toDecimal(70),
        assessment: {
          id: 'a1',
          title: 'Quiz 1',
          due_date: null,
          max_score: 100,
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Math' },
        },
      },
      {
        raw_score: toDecimal(80),
        assessment: {
          id: 'a2',
          title: 'Essay',
          due_date: null,
          max_score: 100,
          subject_id: 'subject-english',
          subject: { id: 'subject-english', name: 'English' },
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, 'student-1', SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.assessment_id).toBe('a1');
  });

  it('should return null percentage when max_score is 0', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        raw_score: toDecimal(50),
        assessment: {
          id: 'a1',
          title: 'Practice',
          due_date: null,
          max_score: 0,
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Math' },
        },
      },
    ]);

    const result = await service.getStudentTrend(TENANT_ID, 'student-1');

    expect(result[0]?.percentage).toBeNull();
  });
});

// ─── Cache Invalidation Tests ─────────────────────────────────────────────────

describe('AnalyticsService — invalidateAssessmentCache', () => {
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

  it('should delete the distribution cache key for assessment', async () => {
    await service.invalidateAssessmentCache(TENANT_ID, ASSESSMENT_ID);

    expect(mockRedis._client.del).toHaveBeenCalledWith(
      `analytics:distribution:${TENANT_ID}:${ASSESSMENT_ID}`,
    );
  });

  it('should not throw when redis del fails', async () => {
    mockRedis._client.del.mockRejectedValue(new Error('Redis down'));

    await expect(
      service.invalidateAssessmentCache(TENANT_ID, ASSESSMENT_ID),
    ).resolves.not.toThrow();
  });
});
