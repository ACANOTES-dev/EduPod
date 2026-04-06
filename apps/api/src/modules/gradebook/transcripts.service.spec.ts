import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { TranscriptsService } from './transcripts.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockRedisClient(cached: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(cached),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

function buildMockRedis(cached: string | null = null) {
  const client = buildMockRedisClient(cached);
  return {
    getClient: jest.fn().mockReturnValue(client),
    _client: client,
  };
}

function buildMockPrisma() {
  return {
    student: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
  };
}

const sampleStudent = {
  id: STUDENT_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  student_number: 'S001',
  year_group: { id: 'yg-1', name: 'Year 10' },
};

function makePeriodSnapshot() {
  return {
    id: 'snap-1',
    student_id: STUDENT_ID,
    tenant_id: TENANT_ID,
    subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
    academic_period: {
      id: PERIOD_ID,
      name: 'Term 1',
      start_date: new Date('2024-09-01'),
      end_date: new Date('2024-12-31'),
      academic_year: { id: YEAR_ID, name: '2024/2025' },
    },
    computed_value: 85.5,
    display_value: 'B+',
    overridden_value: null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TranscriptsService', () => {
  let service: TranscriptsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockStudentFacade: { findOneGeneric: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockStudentFacade = { findOneGeneric: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        TranscriptsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get<TranscriptsService>(TranscriptsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getTranscriptData ────────────────────────────────────────────────────

  describe('getTranscriptData', () => {
    it('should return cached transcript data when Redis cache hit occurs', async () => {
      const cachedData = {
        student: {
          id: STUDENT_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          student_number: 'S001',
          year_group: 'Year 10',
        },
        academic_years: [],
      };
      mockRedis = buildMockRedis(JSON.stringify(cachedData));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          TranscriptsService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: RedisService, useValue: mockRedis },
          { provide: StudentReadFacade, useValue: mockStudentFacade },
        ],
      }).compile();
      service = module.get<TranscriptsService>(TranscriptsService);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(cachedData);
      expect(mockStudentFacade.findOneGeneric).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when student does not exist', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue(null);

      await expect(service.getTranscriptData(TENANT_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return transcript with empty academic years when no snapshots exist', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.id).toBe(STUDENT_ID);
      expect(result.academic_years).toHaveLength(0);
    });

    it('should group snapshots by academic year and period', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([makePeriodSnapshot()]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.academic_years).toHaveLength(1);
      expect(result.academic_years[0]?.academic_year_name).toBe('2024/2025');
      expect(result.academic_years[0]?.periods).toHaveLength(1);
      expect(result.academic_years[0]?.periods[0]?.subjects).toHaveLength(1);
      expect(result.academic_years[0]?.periods[0]?.subjects[0]?.computed_value).toBe(85.5);
    });

    it('should write the result to Redis cache after computing', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(mockRedis._client.set).toHaveBeenCalledWith(
        `transcript:${TENANT_ID}:${STUDENT_ID}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should include student year_group name in the response', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.year_group).toBe('Year 10');
    });

    it('should handle students with no year group gracefully', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue({ ...sampleStudent, year_group: null });
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.year_group).toBeNull();
    });

    it('should normalize missing student numbers and subject codes to null', async () => {
      mockStudentFacade.findOneGeneric.mockResolvedValue({
        ...sampleStudent,
        student_number: null,
      });
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
        {
          ...makePeriodSnapshot(),
          subject: { id: SUBJECT_ID, name: 'Math', code: undefined },
        },
      ]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.student_number).toBeNull();
      expect(result.academic_years[0]?.periods[0]?.subjects[0]?.subject_code).toBeNull();
    });

    it('should still compute transcript when Redis get throws an error', async () => {
      mockRedis._client.get.mockRejectedValue(new Error('Redis connection error'));
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.id).toBe(STUDENT_ID);
    });

    it('should still compute transcript when Redis set throws a non-Error value', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      mockRedis._client.set.mockRejectedValue('redis write failed');
      mockStudentFacade.findOneGeneric.mockResolvedValue(sampleStudent);
      mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getTranscriptData(TENANT_ID, STUDENT_ID);

      expect(result.student.id).toBe(STUDENT_ID);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // ─── invalidateCache ──────────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('should call Redis del with the correct cache key', async () => {
      await service.invalidateCache(TENANT_ID, STUDENT_ID);

      expect(mockRedis._client.del).toHaveBeenCalledWith(`transcript:${TENANT_ID}:${STUDENT_ID}`);
    });

    it('should not throw when Redis del fails', async () => {
      mockRedis._client.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.invalidateCache(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
    });

    it('should not throw when Redis del fails with a string value', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      mockRedis._client.del.mockRejectedValue('Redis string error');

      await expect(service.invalidateCache(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
