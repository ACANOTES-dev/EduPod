import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';

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

// ─── invalidateTranscriptCache Tests ─────────────────────────────────────────

describe('ReportCardTranscriptService — invalidateTranscriptCache', () => {
  let service: ReportCardTranscriptService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(() => {
    mockRedis = buildMockRedis();

    service = new ReportCardTranscriptService(
      buildMockPrisma() as unknown as PrismaService,
      mockRedis as unknown as RedisService,
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

  beforeEach(() => {
    mockPrisma = buildMockPrisma();

    service = new ReportCardTranscriptService(
      mockPrisma as unknown as PrismaService,
      buildMockRedis() as unknown as RedisService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.generateTranscript(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty academic_years when no snapshots', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'STU001',
      year_group: { id: 'yg-1', name: 'Year 5' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.id).toBe(STUDENT_ID);
    expect(result.academic_years).toHaveLength(0);
  });

  it('should group snapshots by academic year and period', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'STU001',
      year_group: { id: 'yg-1', name: 'Year 5' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          academic_year: { id: 'ay-1', name: '2025-2026' },
        },
      },
      {
        student_id: STUDENT_ID,
        subject_id: 's2',
        computed_value: 78,
        display_value: 'B',
        overridden_value: null,
        subject: { id: 's2', name: 'Science', code: 'SCI' },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          academic_year: { id: 'ay-1', name: '2025-2026' },
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
        principal_comment: null,
        published_at: new Date(),
      },
    ]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.academic_years).toHaveLength(1);
    expect(result.academic_years[0]?.academic_year_name).toBe('2025-2026');
    expect(result.academic_years[0]?.periods).toHaveLength(1);

    const period = result.academic_years[0]?.periods[0];
    expect(period?.subjects).toHaveLength(2);
    expect(period?.gpa).toBe(3.5);
    expect(period?.teacher_comment).toBe('Good work');
  });

  it('should handle multiple academic years', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'STU001',
      year_group: { id: 'yg-1', name: 'Year 6' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2024-09-01'),
          end_date: new Date('2024-12-15'),
          academic_year: { id: 'ay-1', name: '2024-2025' },
        },
      },
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 90,
        display_value: 'A+',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p2',
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          academic_year: { id: 'ay-2', name: '2025-2026' },
        },
      },
    ]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.academic_years).toHaveLength(2);
  });

  it('should set overridden_value to null when not present', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: null,
      year_group: null,
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 70,
        display_value: 'C',
        overridden_value: null,
        subject: { id: 's1', name: 'English', code: null },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          academic_year: { id: 'ay-1', name: '2025-2026' },
        },
      },
    ]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.student_number).toBeNull();
    expect(result.student.year_group).toBeNull();

    const subject = result.academic_years[0]?.periods[0]?.subjects[0];
    expect(subject?.overridden_value).toBeNull();
    expect(subject?.subject_code).toBeNull();
  });
});
