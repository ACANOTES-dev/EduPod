/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type { AiDecisionDto, CreateAiLogDto } from '../ai-audit.service';
import { AiAuditService } from '../ai-audit.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Mock Factories ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    aiProcessingLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
}

function buildCreateLogDto(
  overrides: Partial<CreateAiLogDto> = {},
): CreateAiLogDto {
  return {
    tenantId: TENANT_ID,
    aiService: 'ai-comments',
    subjectType: 'student',
    subjectId: STUDENT_ID,
    modelUsed: 'claude-sonnet-4-20250514',
    promptHash: 'abc123def456',
    promptSummary: 'Generate report card comment',
    responseSummary: 'Student shows strong progress in maths',
    inputDataCategories: ['grades', 'attendance'],
    tokenised: true,
    processingTimeMs: 1250,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('AiAuditService', () => {
  let service: AiAuditService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockCreateRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) =>
          fn(mockPrisma),
      ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiAuditService>(AiAuditService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── log() ──────────────────────────────────────────────────────────────────

  describe('log', () => {
    it('should create a record via RLS transaction and return the log ID', async () => {
      mockPrisma.aiProcessingLog.create.mockResolvedValue({ id: LOG_ID });

      const dto = buildCreateLogDto();
      const result = await service.log(dto);

      expect(result).toBe(LOG_ID);
      expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
      });
      expect(mockPrisma.aiProcessingLog.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          ai_service: 'ai-comments',
          subject_type: 'student',
          subject_id: STUDENT_ID,
          model_used: 'claude-sonnet-4-20250514',
          prompt_hash: 'abc123def456',
          prompt_summary: 'Generate report card comment',
          response_summary: 'Student shows strong progress in maths',
          input_data_categories: ['grades', 'attendance'],
          tokenised: true,
          token_usage_log_id: null,
          confidence_score: null,
          processing_time_ms: 1250,
        },
        select: { id: true },
      });
    });

    it('should NOT throw on failure — returns empty string and logs error', async () => {
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockRejectedValue(new Error('DB down')),
      });

      const loggerSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      const dto = buildCreateLogDto();
      const result = await service.log(dto);

      expect(result).toBe('');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write AI audit log'),
        expect.any(String),
      );
    });

    it('should map optional nullable fields to null when not provided', async () => {
      mockPrisma.aiProcessingLog.create.mockResolvedValue({ id: LOG_ID });

      const dto = buildCreateLogDto({
        subjectType: undefined,
        subjectId: undefined,
        tokenUsageLogId: undefined,
        confidenceScore: undefined,
      });

      await service.log(dto);

      const createCall = mockPrisma.aiProcessingLog.create.mock.calls[0][0];
      expect(createCall.data.subject_type).toBeNull();
      expect(createCall.data.subject_id).toBeNull();
      expect(createCall.data.token_usage_log_id).toBeNull();
      expect(createCall.data.confidence_score).toBeNull();
    });
  });

  // ─── recordDecision() ───────────────────────────────────────────────────────

  describe('recordDecision', () => {
    it('should update the log with decision fields', async () => {
      mockPrisma.aiProcessingLog.findFirst.mockResolvedValue({ id: LOG_ID });
      mockPrisma.aiProcessingLog.update.mockResolvedValue({ id: LOG_ID });

      const decision: AiDecisionDto = {
        outputUsed: true,
        acceptedByUserId: USER_ID,
        acceptedAt: new Date('2026-03-28T12:00:00Z'),
      };

      await service.recordDecision(TENANT_ID, LOG_ID, decision);

      expect(mockPrisma.aiProcessingLog.findFirst).toHaveBeenCalledWith({
        where: { id: LOG_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
      expect(mockPrisma.aiProcessingLog.update).toHaveBeenCalledWith({
        where: { id: LOG_ID },
        data: {
          output_used: true,
          accepted_by_user_id: USER_ID,
          accepted_at: new Date('2026-03-28T12:00:00Z'),
          rejected_reason: null,
        },
      });
    });

    it('should record rejection with a reason', async () => {
      mockPrisma.aiProcessingLog.findFirst.mockResolvedValue({ id: LOG_ID });
      mockPrisma.aiProcessingLog.update.mockResolvedValue({ id: LOG_ID });

      const decision: AiDecisionDto = {
        outputUsed: false,
        rejectedReason: 'Comment tone was inappropriate',
      };

      await service.recordDecision(TENANT_ID, LOG_ID, decision);

      expect(mockPrisma.aiProcessingLog.update).toHaveBeenCalledWith({
        where: { id: LOG_ID },
        data: {
          output_used: false,
          accepted_by_user_id: null,
          accepted_at: null,
          rejected_reason: 'Comment tone was inappropriate',
        },
      });
    });

    it('should throw NotFoundException for non-existent logId', async () => {
      mockPrisma.aiProcessingLog.findFirst.mockResolvedValue(null);

      const decision: AiDecisionDto = { outputUsed: true };

      await expect(
        service.recordDecision(TENANT_ID, LOG_ID, decision),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getLogById() ───────────────────────────────────────────────────────────

  describe('getLogById', () => {
    it('should return the log when it exists', async () => {
      const mockLog = { id: LOG_ID, ai_service: 'ai-comments', tenant_id: TENANT_ID };
      mockPrisma.aiProcessingLog.findFirst.mockResolvedValue(mockLog);

      const result = await service.getLogById(TENANT_ID, LOG_ID);

      expect(result).toEqual(mockLog);
      expect(mockPrisma.aiProcessingLog.findFirst).toHaveBeenCalledWith({
        where: { id: LOG_ID, tenant_id: TENANT_ID },
      });
    });

    it('should return null when the log does not exist', async () => {
      mockPrisma.aiProcessingLog.findFirst.mockResolvedValue(null);

      const result = await service.getLogById(TENANT_ID, LOG_ID);

      expect(result).toBeNull();
    });
  });

  // ─── getLogsForSubject() ────────────────────────────────────────────────────

  describe('getLogsForSubject', () => {
    it('should return paginated logs filtered by subject', async () => {
      const mockLogs = [
        { id: LOG_ID, ai_service: 'ai-comments', created_at: new Date() },
      ];
      mockPrisma.aiProcessingLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.aiProcessingLog.count.mockResolvedValue(1);

      const result = await service.getLogsForSubject(
        TENANT_ID,
        'student',
        STUDENT_ID,
        1,
        20,
      );

      expect(result).toEqual({
        data: mockLogs,
        meta: { page: 1, pageSize: 20, total: 1 },
      });
      expect(mockPrisma.aiProcessingLog.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          subject_type: 'student',
          subject_id: STUDENT_ID,
        },
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should calculate skip correctly for page 3', async () => {
      mockPrisma.aiProcessingLog.findMany.mockResolvedValue([]);
      mockPrisma.aiProcessingLog.count.mockResolvedValue(0);

      await service.getLogsForSubject(TENANT_ID, 'student', STUDENT_ID, 3, 10);

      expect(mockPrisma.aiProcessingLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // ─── getLogsByService() ─────────────────────────────────────────────────────

  describe('getLogsByService', () => {
    it('should return paginated logs filtered by service', async () => {
      const mockLogs = [
        { id: LOG_ID, ai_service: 'ai-grading', created_at: new Date() },
      ];
      mockPrisma.aiProcessingLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.aiProcessingLog.count.mockResolvedValue(15);

      const result = await service.getLogsByService(
        TENANT_ID,
        'ai-grading',
        2,
        5,
      );

      expect(result).toEqual({
        data: mockLogs,
        meta: { page: 2, pageSize: 5, total: 15 },
      });
      expect(mockPrisma.aiProcessingLog.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, ai_service: 'ai-grading' },
        orderBy: { created_at: 'desc' },
        skip: 5,
        take: 5,
      });
    });
  });

  // ─── getStats() ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return correct aggregation statistics', async () => {
      const allLogs = [
        { ai_service: 'ai-comments', processing_time_ms: 1000 },
        { ai_service: 'ai-comments', processing_time_ms: 2000 },
        { ai_service: 'ai-grading', processing_time_ms: 1500 },
      ];

      // totalLogs
      mockPrisma.aiProcessingLog.count
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(2) // decisioned (output_used not null)
        .mockResolvedValueOnce(1) // accepted (output_used = true)
        .mockResolvedValueOnce(2); // tokenised

      mockPrisma.aiProcessingLog.findMany.mockResolvedValue(allLogs);

      const stats = await service.getStats(TENANT_ID);

      expect(stats.totalLogs).toBe(3);
      expect(stats.byService).toEqual({
        'ai-comments': 2,
        'ai-grading': 1,
      });
      expect(stats.acceptanceRate).toBe(0.5); // 1 accepted / 2 decisioned
      expect(stats.avgProcessingTimeMs).toBe(1500); // (1000+2000+1500)/3
      expect(stats.tokenisationRate).toBeCloseTo(2 / 3);
    });

    it('should return null rates when no data exists', async () => {
      mockPrisma.aiProcessingLog.count
        .mockResolvedValueOnce(0) // total
        .mockResolvedValueOnce(0) // decisioned
        .mockResolvedValueOnce(0) // accepted
        .mockResolvedValueOnce(0); // tokenised

      mockPrisma.aiProcessingLog.findMany.mockResolvedValue([]);

      const stats = await service.getStats(TENANT_ID);

      expect(stats.totalLogs).toBe(0);
      expect(stats.byService).toEqual({});
      expect(stats.acceptanceRate).toBeNull();
      expect(stats.avgProcessingTimeMs).toBeNull();
      expect(stats.tokenisationRate).toBe(0);
    });

    it('should apply date filters when provided', async () => {
      mockPrisma.aiProcessingLog.count
        .mockResolvedValue(0);
      mockPrisma.aiProcessingLog.findMany.mockResolvedValue([]);

      await service.getStats(TENANT_ID, '2026-01-01', '2026-03-31');

      const expectedWhere = {
        tenant_id: TENANT_ID,
        created_at: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-03-31'),
        },
      };

      // Verify the count calls include date filters
      expect(mockPrisma.aiProcessingLog.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(mockPrisma.aiProcessingLog.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        select: { ai_service: true, processing_time_ms: true },
      });
    });
  });

  // ─── Prompt hash determinism ────────────────────────────────────────────────

  describe('prompt hash determinism', () => {
    it('should store the caller-provided prompt hash faithfully', async () => {
      mockPrisma.aiProcessingLog.create.mockResolvedValue({ id: LOG_ID });

      const hash = 'sha256-abc123def456789';
      const dto = buildCreateLogDto({ promptHash: hash });
      await service.log(dto);

      const createCall = mockPrisma.aiProcessingLog.create.mock.calls[0][0];
      expect(createCall.data.prompt_hash).toBe(hash);
    });

    it('same prompt hash input produces same stored value', async () => {
      mockPrisma.aiProcessingLog.create.mockResolvedValue({ id: LOG_ID });

      const hash = 'deterministic-hash-value-123';
      await service.log(buildCreateLogDto({ promptHash: hash }));
      await service.log(buildCreateLogDto({ promptHash: hash }));

      const firstCall = mockPrisma.aiProcessingLog.create.mock.calls[0][0];
      const secondCall = mockPrisma.aiProcessingLog.create.mock.calls[1][0];
      expect(firstCall.data.prompt_hash).toBe(secondCall.data.prompt_hash);
    });
  });
});
