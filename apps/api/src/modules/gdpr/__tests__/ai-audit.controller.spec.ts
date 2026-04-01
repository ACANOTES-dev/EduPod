import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { AiAuditController } from '../ai-audit.controller';
import { AiAuditService } from '../ai-audit.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LOG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'admin@test-school.ie',
  tenant_id: TENANT_ID,
  membership_id: 'membership-id',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock Service ────────────────────────────────────────────────────────────

function buildMockAiAuditService() {
  return {
    log: jest.fn(),
    recordDecision: jest.fn(),
    getLogsForSubject: jest.fn(),
    getLogsByService: jest.fn(),
    getStats: jest.fn(),
    getLogById: jest.fn(),
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_LOG = {
  id: LOG_ID,
  tenant_id: TENANT_ID,
  ai_service: 'ai_grading',
  subject_type: 'student',
  subject_id: STUDENT_ID,
  model_used: 'claude-sonnet-4-6-20250514',
  prompt_hash: 'abc123',
  prompt_summary: 'Grade assignment for student',
  response_summary: 'AI suggested grade: B+ (82%)',
  input_data_categories: ['grades', 'attendance'],
  tokenised: true,
  output_used: true,
  accepted_by_user_id: USER_ID,
  accepted_at: new Date('2026-03-15T11:00:00Z'),
  rejected_reason: null,
  confidence_score: 0.87,
  processing_time_ms: 1200,
  created_at: new Date('2026-03-15T10:30:00Z'),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('AiAuditController', () => {
  let controller: AiAuditController;
  let mockService: ReturnType<typeof buildMockAiAuditService>;

  beforeEach(async () => {
    mockService = buildMockAiAuditService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiAuditController],
      providers: [{ provide: AiAuditService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiAuditController>(AiAuditController);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/ai-audit/subject/:type/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSubjectLogs', () => {
    it('should call service with correct params and return paginated result', async () => {
      const expected = {
        data: [SAMPLE_LOG],
        meta: { page: 1, pageSize: 20, total: 1 },
      };
      mockService.getLogsForSubject.mockResolvedValue(expected);

      const result = await controller.getSubjectLogs(TENANT, 'student', STUDENT_ID, 1, 20);

      expect(mockService.getLogsForSubject).toHaveBeenCalledTimes(1);
      expect(mockService.getLogsForSubject).toHaveBeenCalledWith(
        TENANT_ID,
        'student',
        STUDENT_ID,
        1,
        20,
      );
      expect(result).toBe(expected);
    });

    it('should forward custom page and pageSize values', async () => {
      const expected = { data: [], meta: { page: 3, pageSize: 10, total: 0 } };
      mockService.getLogsForSubject.mockResolvedValue(expected);

      await controller.getSubjectLogs(TENANT, 'staff', STUDENT_ID, 3, 10);

      expect(mockService.getLogsForSubject).toHaveBeenCalledWith(
        TENANT_ID,
        'staff',
        STUDENT_ID,
        3,
        10,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/ai-audit/service/:service
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getServiceLogs', () => {
    it('should call service with correct params and return paginated result', async () => {
      const expected = {
        data: [SAMPLE_LOG],
        meta: { page: 1, pageSize: 20, total: 1 },
      };
      mockService.getLogsByService.mockResolvedValue(expected);

      const result = await controller.getServiceLogs(TENANT, 'ai_grading', 1, 20);

      expect(mockService.getLogsByService).toHaveBeenCalledTimes(1);
      expect(mockService.getLogsByService).toHaveBeenCalledWith(TENANT_ID, 'ai_grading', 1, 20);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/ai-audit/stats
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getStats', () => {
    it('should call service and return stats', async () => {
      const expected = {
        totalLogs: 150,
        byService: { ai_grading: 80, ai_comments: 70 },
        acceptanceRate: 0.85,
        avgProcessingTimeMs: 950,
        tokenisationRate: 1.0,
      };
      mockService.getStats.mockResolvedValue(expected);

      const result = await controller.getStats(TENANT);

      expect(mockService.getStats).toHaveBeenCalledTimes(1);
      expect(mockService.getStats).toHaveBeenCalledWith(TENANT_ID, undefined, undefined);
      expect(result).toBe(expected);
    });

    it('should forward date_from and date_to query params', async () => {
      mockService.getStats.mockResolvedValue({ totalLogs: 0 });

      await controller.getStats(TENANT, '2026-01-01T00:00:00Z', '2026-03-31T23:59:59Z');

      expect(mockService.getStats).toHaveBeenCalledWith(
        TENANT_ID,
        '2026-01-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/ai-audit/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getLogDetail', () => {
    it('should return formatted right-to-explanation payload', async () => {
      mockService.getLogById.mockResolvedValue(SAMPLE_LOG);

      const result = await controller.getLogDetail(TENANT, LOG_ID);

      expect(mockService.getLogById).toHaveBeenCalledWith(TENANT_ID, LOG_ID);
      expect(result).toEqual({
        decision: {
          type: 'ai_grading',
          subject_type: 'student',
          subject_id: STUDENT_ID,
          date: new Date('2026-03-15T10:30:00Z'),
        },
        ai_input: {
          data_categories: ['grades', 'attendance'],
          tokenised: true,
          note: 'Student identifiers were anonymised before processing',
        },
        ai_output: {
          summary: 'AI suggested grade: B+ (82%)',
          model: 'claude-sonnet-4-6-20250514',
          confidence: 0.87,
          processing_time_ms: 1200,
        },
        human_review: {
          reviewed: true,
          accepted: true,
          reviewed_by_user_id: USER_ID,
          reviewed_at: new Date('2026-03-15T11:00:00Z'),
        },
      });
    });

    it('should return reviewed=false when output_used is null', async () => {
      const unreviewedLog = {
        ...SAMPLE_LOG,
        output_used: null,
        accepted_by_user_id: null,
        accepted_at: null,
      };
      mockService.getLogById.mockResolvedValue(unreviewedLog);

      const result = await controller.getLogDetail(TENANT, LOG_ID);

      expect(result.human_review).toEqual({
        reviewed: false,
        accepted: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
      });
    });

    it('should include rejected_reason when present', async () => {
      const rejectedLog = {
        ...SAMPLE_LOG,
        output_used: false,
        rejected_reason: 'AI grade was inaccurate',
        accepted_by_user_id: USER_ID,
        accepted_at: new Date('2026-03-15T11:00:00Z'),
      };
      mockService.getLogById.mockResolvedValue(rejectedLog);

      const result = await controller.getLogDetail(TENANT, LOG_ID);

      expect(result.human_review.accepted).toBe(false);
      expect(result.human_review.rejected_reason).toBe('AI grade was inaccurate');
    });

    it('should set note to null when tokenised is false', async () => {
      const untokenisedLog = { ...SAMPLE_LOG, tokenised: false };
      mockService.getLogById.mockResolvedValue(untokenisedLog);

      const result = await controller.getLogDetail(TENANT, LOG_ID);

      expect(result.ai_input.tokenised).toBe(false);
      expect(result.ai_input.note).toBeNull();
    });

    it('should throw NotFoundException when log not found', async () => {
      mockService.getLogById.mockResolvedValue(null);

      await expect(controller.getLogDetail(TENANT, LOG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /v1/ai-audit/:id/decision
  // ═══════════════════════════════════════════════════════════════════════════

  describe('recordDecision', () => {
    it('should call recordDecision with correct params', async () => {
      mockService.recordDecision.mockResolvedValue(undefined);

      const body = { output_used: true };
      const result = await controller.recordDecision(TENANT, USER, LOG_ID, body);

      expect(mockService.recordDecision).toHaveBeenCalledTimes(1);
      expect(mockService.recordDecision).toHaveBeenCalledWith(
        TENANT_ID,
        LOG_ID,
        expect.objectContaining({
          outputUsed: true,
          acceptedByUserId: USER_ID,
          rejectedReason: null,
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('should forward rejected_reason when output is rejected', async () => {
      mockService.recordDecision.mockResolvedValue(undefined);

      const body = {
        output_used: false,
        rejected_reason: 'Grade was incorrect',
      };
      await controller.recordDecision(TENANT, USER, LOG_ID, body);

      expect(mockService.recordDecision).toHaveBeenCalledWith(
        TENANT_ID,
        LOG_ID,
        expect.objectContaining({
          outputUsed: false,
          acceptedByUserId: USER_ID,
          rejectedReason: 'Grade was incorrect',
        }),
      );
    });
  });
});
