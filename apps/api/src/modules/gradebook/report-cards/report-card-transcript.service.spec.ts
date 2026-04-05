import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';
import type { StudentReadFacade } from '../../students/student-read.facade';

import { ReportCardTranscriptService } from './report-card-transcript.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
    reportCard: { findMany: jest.fn() },
  };
}

function buildMockRedis() {
  const mockClient = {
    del: jest.fn().mockResolvedValue(1),
  };
  return {
    getClient: jest.fn().mockReturnValue(mockClient),
    _client: mockClient,
  };
}

function buildMockStudentFacade() {
  return {
    findOneGeneric: jest.fn().mockResolvedValue(null),
  };
}

// ─── invalidateTranscriptCache Tests ─────────────────────────────────────────

describe('ReportCardTranscriptService — invalidateTranscriptCache', () => {
  let service: ReportCardTranscriptService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(() => {
    mockRedis = buildMockRedis();

    service = new ReportCardTranscriptService(
      buildMockPrisma() as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      buildMockStudentFacade() as unknown as StudentReadFacade,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete transcript cache key', async () => {
    await service.invalidateTranscriptCache(TENANT_ID, STUDENT_ID);

    expect(mockRedis._client.del).toHaveBeenCalledWith(`transcript:${TENANT_ID}:${STUDENT_ID}`);
  });

  it('should not throw when Redis fails', async () => {
    mockRedis._client.del.mockRejectedValue(new Error('Redis down'));

    await expect(service.invalidateTranscriptCache(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
  });
});

// ─── generateTranscript Tests ────────────────────────────────────────────────

describe('ReportCardTranscriptService — generateTranscript', () => {
  let service: ReportCardTranscriptService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStudentFacade: ReturnType<typeof buildMockStudentFacade>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    mockStudentFacade = buildMockStudentFacade();

    service = new ReportCardTranscriptService(
      mockPrisma as unknown as PrismaService,
      buildMockRedis() as unknown as RedisService,
      mockStudentFacade as unknown as StudentReadFacade,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue(null);

    await expect(service.generateTranscript(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty academic_years when no snapshots exist', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'S001',
      year_group: { id: 'yg-1', name: 'Year 5' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.id).toBe(STUDENT_ID);
    expect(result.student.student_number).toBe('S001');
    expect(result.student.year_group).toBe('Year 5');
    expect(result.academic_years).toHaveLength(0);
  });

  it('should build transcript with subjects grouped by year and period', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: null,
      year_group: null,
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2026-01-01'),
          end_date: new Date('2026-03-31'),
          academic_year: { id: 'ay1', name: '2025-2026' },
        },
      },
      {
        student_id: STUDENT_ID,
        computed_value: 78,
        display_value: 'B+',
        overridden_value: 'A-',
        subject: { id: 's2', name: 'Science', code: null },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2026-01-01'),
          end_date: new Date('2026-03-31'),
          academic_year: { id: 'ay1', name: '2025-2026' },
        },
      },
      {
        student_id: STUDENT_ID,
        computed_value: 92,
        display_value: 'A+',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p2',
          name: 'Term 2',
          start_date: new Date('2026-04-01'),
          end_date: new Date('2026-06-30'),
          academic_year: { id: 'ay1', name: '2025-2026' },
        },
      },
    ]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
      { academic_period_id: 'p1', gpa_value: 3.5 },
    ]);
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        academic_period_id: 'p1',
        teacher_comment: 'Good work',
        principal_comment: 'Keep it up',
        published_at: new Date('2026-04-01'),
      },
    ]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.student_number).toBeNull();
    expect(result.student.year_group).toBeNull();
    expect(result.academic_years).toHaveLength(1);

    const year = result.academic_years[0]!;
    expect(year.academic_year_name).toBe('2025-2026');
    expect(year.periods).toHaveLength(2);

    const term1 = year.periods.find((p: { period_name: string }) => p.period_name === 'Term 1')!;
    expect(term1.gpa).toBe(3.5);
    expect(term1.teacher_comment).toBe('Good work');
    expect(term1.principal_comment).toBe('Keep it up');
    expect(term1.subjects).toHaveLength(2);

    const mathSubject = term1.subjects.find(
      (s: { subject_name: string }) => s.subject_name === 'Math',
    )!;
    expect(mathSubject.subject_code).toBe('MATH');
    expect(mathSubject.overridden_value).toBeNull();

    const scienceSubject = term1.subjects.find(
      (s: { subject_name: string }) => s.subject_name === 'Science',
    )!;
    expect(scienceSubject.subject_code).toBeNull();
    expect(scienceSubject.overridden_value).toBe('A-');

    const term2 = year.periods.find((p: { period_name: string }) => p.period_name === 'Term 2')!;
    expect(term2.gpa).toBeNull();
    expect(term2.teacher_comment).toBeNull();
    expect(term2.principal_comment).toBeNull();
    expect(term2.subjects).toHaveLength(1);
  });

  it('edge: should handle Error instance in invalidateTranscriptCache', async () => {
    const mockRedisForError = buildMockRedis();
    mockRedisForError._client.del.mockRejectedValue(new Error('Connection refused'));

    const svc = new ReportCardTranscriptService(
      buildMockPrisma() as unknown as PrismaService,
      mockRedisForError as unknown as RedisService,
      buildMockStudentFacade() as unknown as StudentReadFacade,
    );

    await expect(svc.invalidateTranscriptCache(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
  });

  it('edge: should handle non-Error in invalidateTranscriptCache', async () => {
    const mockRedisForError = buildMockRedis();
    mockRedisForError._client.del.mockRejectedValue('string error');

    const svc = new ReportCardTranscriptService(
      buildMockPrisma() as unknown as PrismaService,
      mockRedisForError as unknown as RedisService,
      buildMockStudentFacade() as unknown as StudentReadFacade,
    );

    await expect(svc.invalidateTranscriptCache(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
  });
});
