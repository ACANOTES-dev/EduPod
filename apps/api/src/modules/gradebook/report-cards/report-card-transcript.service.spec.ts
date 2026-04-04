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
});
