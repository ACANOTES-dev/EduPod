import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AiPredictionsService } from './ai-predictions.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Mock Prisma Transaction ──────────────────────────────────────────────
//
// `createRlsClient(...).$transaction(fn)` invokes its callback with a
// transaction client. Our service calls `findFirst`/`findMany`/`groupBy`/
// `count` on several models. The mock returns a bag of jest mocks that
// each test can configure per-case.

interface MockTx {
  student: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  yearGroup: { findFirst: jest.Mock };
  senProfile: { findFirst: jest.Mock };
  safeguardingConcern: { count: jest.Mock };
  attendanceRecord: { groupBy: jest.Mock; findMany: jest.Mock };
  behaviourIncidentParticipant: { count: jest.Mock };
  grade: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
}

const mockTx: MockTx = {
  student: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  yearGroup: { findFirst: jest.fn() },
  senProfile: { findFirst: jest.fn() },
  safeguardingConcern: { count: jest.fn() },
  attendanceRecord: { groupBy: jest.fn(), findMany: jest.fn() },
  behaviourIncidentParticipant: { count: jest.fn() },
  grade: { findMany: jest.fn() },
  payment: { findMany: jest.fn() },
  invoice: { findMany: jest.fn() },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

// ─── Mock Redis client (cache) ─────────────────────────────────────────────

interface MockRedisClient {
  get: jest.Mock;
  setex: jest.Mock;
}

const mockRedisClient: MockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
};

const mockRedisService = {
  getClient: () => mockRedisClient,
};

const VALID_RISK_RESPONSE = {
  risk_score: 65,
  narrative: 'Student shows declining attendance and recent failing grades.',
  factors: [
    { label: 'Low attendance', weight: 'high' as const },
    { label: 'Recent failing grades', weight: 'medium' as const },
  ],
  confidence: 'high' as const,
};

const VALID_ATTENDANCE_RESPONSE = {
  forecast: [
    { week_start: '2026-05-04', predicted_rate: 92, confidence_interval: [88, 96] },
    { week_start: '2026-05-11', predicted_rate: 91, confidence_interval: [86, 95] },
  ],
  narrative: 'Attendance expected to remain stable through May.',
  confidence: 'high' as const,
};

const VALID_CASHFLOW_RESPONSE = {
  forecast: [
    { date: '2026-05-04', expected_receipts: 5000, confidence_interval: [4000, 6000] },
    { date: '2026-05-05', expected_receipts: 3500, confidence_interval: [2800, 4200] },
  ],
  narrative: 'Pending invoices imply steady receipts over the next week.',
  confidence: 'medium' as const,
};

describe('AiPredictionsService', () => {
  let service: AiPredictionsService;
  let module: TestingModule;
  let mockAnthropic: { isConfigured: boolean; createMessage: jest.Mock };
  let mockSettings: { getSettings: jest.Mock };
  let mockAudit: { log: jest.Mock };
  let mockGdpr: { processOutbound: jest.Mock };

  beforeEach(async () => {
    mockAnthropic = {
      isConfigured: true,
      createMessage: jest.fn(),
    };

    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({ ai: { predictionsEnabled: true } }),
    };

    mockAudit = { log: jest.fn().mockResolvedValue('test-log-id') };

    mockGdpr = {
      processOutbound: jest.fn().mockResolvedValue({
        processedData: { entities: [], entityCount: 0 },
        tokenMap: null,
      }),
    };

    // Reset Prisma mock results to a healthy default for student-risk happy path.
    mockTx.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      student_number: 'S-001',
      first_name: 'Alice',
      last_name: 'Smith',
      year_group: { name: 'Year 5' },
    });
    mockTx.student.findMany.mockResolvedValue([]);
    mockTx.student.count.mockResolvedValue(0);
    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID, name: 'Year 5' });
    mockTx.senProfile.findFirst.mockResolvedValue(null);
    mockTx.safeguardingConcern.count.mockResolvedValue(0);
    mockTx.attendanceRecord.groupBy.mockResolvedValue([
      { status: 'present', _count: 80 },
      { status: 'late', _count: 5 },
      { status: 'absent_unexcused', _count: 15 },
    ]);
    mockTx.attendanceRecord.findMany.mockResolvedValue([]);
    mockTx.behaviourIncidentParticipant.count.mockResolvedValue(2);
    mockTx.grade.findMany.mockResolvedValue([]);
    mockTx.payment.findMany.mockResolvedValue([
      { amount: 1000, received_at: new Date('2026-04-01') },
    ]);
    mockTx.invoice.findMany.mockResolvedValue([]);
    mockRedisClient.get.mockResolvedValue(null);

    module = await Test.createTestingModule({
      providers: [
        AiPredictionsService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AnthropicClientService, useValue: mockAnthropic },
        { provide: AiAuditService, useValue: mockAudit },
        { provide: SettingsService, useValue: mockSettings },
        { provide: GdprTokenService, useValue: mockGdpr },
      ],
    }).compile();

    service = module.get<AiPredictionsService>(AiPredictionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── predictStudentRisk ─────────────────────────────────────────────────

  describe('predictStudentRisk', () => {
    it('returns a Zod-validated prediction on the happy path', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_RISK_RESPONSE) }],
      });

      const result = await service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.risk_score).toBe(65);
      expect(result.narrative).toBe(VALID_RISK_RESPONSE.narrative);
      expect(result.factors).toHaveLength(2);
      expect(result.confidence).toBe('high');
      expect(result.cache_hit).toBe(false);
      expect(typeof result.generated_at).toBe('string');
    });

    it('writes to the AI audit log when generating fresh', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_RISK_RESPONSE) }],
      });

      await service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          aiService: 'reports_predictions',
          subjectType: 'student',
          subjectId: STUDENT_ID,
          tokenised: true,
        }),
      );
    });

    it('returns cache_hit: true on second call within TTL', async () => {
      const cached = {
        ...VALID_RISK_RESPONSE,
        generated_at: '2026-04-24T12:00:00.000Z',
        cache_hit: false,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.cache_hit).toBe(true);
      expect(result.risk_score).toBe(65);
      expect(mockAnthropic.createMessage).not.toHaveBeenCalled();
    });

    it('bypasses cache when refresh=true', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ ...VALID_RISK_RESPONSE }));
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_RISK_RESPONSE) }],
      });

      const result = await service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID, true);

      expect(result.cache_hit).toBe(false);
      expect(mockAnthropic.createMessage).toHaveBeenCalledTimes(1);
    });

    it('throws AI_UNAVAILABLE when Anthropic is not configured', async () => {
      mockAnthropic.isConfigured = false;

      await expect(
        service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws AI_PREDICTION_UNPARSEABLE when AI returns malformed JSON', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'this is not json {' }],
      });

      await expect(
        service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_PREDICTION_UNPARSEABLE' }),
      });
    });

    it('throws AI_PREDICTION_UNPARSEABLE when AI returns invalid shape', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          { type: 'text', text: JSON.stringify({ risk_score: 'high', narrative: 'oops' }) },
        ],
      });

      await expect(
        service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_PREDICTION_UNPARSEABLE' }),
      });
    });

    it('throws STUDENT_NOT_FOUND when the student is not in tenant scope', async () => {
      mockTx.student.findFirst.mockResolvedValue(null);

      await expect(
        service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STUDENT_NOT_FOUND' }),
      });
    });

    it('strips markdown fences from the AI response before parsing', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify(VALID_RISK_RESPONSE) + '\n```',
          },
        ],
      });

      const result = await service.predictStudentRisk(TENANT_ID, USER_ID, STUDENT_ID);

      expect(result.risk_score).toBe(65);
    });
  });

  // ─── forecastAttendance ─────────────────────────────────────────────────

  describe('forecastAttendance', () => {
    beforeEach(() => {
      mockTx.attendanceRecord.findMany.mockResolvedValue([
        { status: 'present', session: { session_date: new Date('2026-04-01') } },
        { status: 'present', session: { session_date: new Date('2026-04-02') } },
        { status: 'absent_unexcused', session: { session_date: new Date('2026-04-03') } },
        { status: 'present', session: { session_date: new Date('2026-04-08') } },
        { status: 'late', session: { session_date: new Date('2026-04-09') } },
      ]);
    });

    it('returns a Zod-validated forecast on the happy path', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_ATTENDANCE_RESPONSE) }],
      });

      const result = await service.forecastAttendance(TENANT_ID, USER_ID, YEAR_GROUP_ID, 4);

      expect(result.forecast).toHaveLength(2);
      expect(result.forecast[0]!.predicted_rate).toBe(92);
      expect(result.confidence).toBe('high');
      expect(result.cache_hit).toBe(false);
    });

    it('returns cache_hit: true when the cache is warm', async () => {
      const cached = {
        ...VALID_ATTENDANCE_RESPONSE,
        generated_at: '2026-04-24T12:00:00.000Z',
        cache_hit: false,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.forecastAttendance(TENANT_ID, USER_ID, YEAR_GROUP_ID, 4);

      expect(result.cache_hit).toBe(true);
      expect(mockAnthropic.createMessage).not.toHaveBeenCalled();
    });

    it('throws YEAR_GROUP_NOT_FOUND when the year group does not exist', async () => {
      mockTx.yearGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.forecastAttendance(TENANT_ID, USER_ID, YEAR_GROUP_ID, 4),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'YEAR_GROUP_NOT_FOUND' }),
      });
    });

    it('throws INSUFFICIENT_ATTENDANCE_DATA when no attendance history exists', async () => {
      mockTx.attendanceRecord.findMany.mockResolvedValue([]);

      await expect(
        service.forecastAttendance(TENANT_ID, USER_ID, YEAR_GROUP_ID, 4),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INSUFFICIENT_ATTENDANCE_DATA' }),
      });
    });

    it('throws AI_PREDICTION_UNPARSEABLE on malformed AI output', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'not json' }],
      });

      await expect(
        service.forecastAttendance(TENANT_ID, USER_ID, YEAR_GROUP_ID, 4),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_PREDICTION_UNPARSEABLE' }),
      });
    });
  });

  // ─── forecastCashFlow ───────────────────────────────────────────────────

  describe('forecastCashFlow', () => {
    it('returns a Zod-validated forecast on the happy path', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_CASHFLOW_RESPONSE) }],
      });

      const result = await service.forecastCashFlow(TENANT_ID, USER_ID, 30);

      expect(result.forecast).toHaveLength(2);
      expect(result.forecast[0]!.expected_receipts).toBe(5000);
      expect(result.confidence).toBe('medium');
      expect(result.cache_hit).toBe(false);
    });

    it('throws INSUFFICIENT_FINANCE_DATA when no payment history exists', async () => {
      mockTx.payment.findMany.mockResolvedValue([]);

      await expect(service.forecastCashFlow(TENANT_ID, USER_ID, 30)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INSUFFICIENT_FINANCE_DATA' }),
      });
    });

    it('returns cache_hit: true when the cache is warm', async () => {
      const cached = {
        ...VALID_CASHFLOW_RESPONSE,
        generated_at: '2026-04-24T12:00:00.000Z',
        cache_hit: false,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.forecastCashFlow(TENANT_ID, USER_ID, 30);

      expect(result.cache_hit).toBe(true);
      expect(mockAnthropic.createMessage).not.toHaveBeenCalled();
    });
  });

  // ─── bulkPredictStudentRisk ─────────────────────────────────────────────

  describe('bulkPredictStudentRisk', () => {
    it('returns paginated entries and respects per-student cache', async () => {
      mockTx.student.findMany.mockResolvedValue([
        {
          id: STUDENT_ID,
          student_number: 'S-001',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      ]);
      mockTx.student.count.mockResolvedValue(1);
      // Per-student cache is warm, so no Anthropic call should fire.
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({
          ...VALID_RISK_RESPONSE,
          generated_at: '2026-04-24T12:00:00.000Z',
          cache_hit: false,
        }),
      );

      const result = await service.bulkPredictStudentRisk(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        1,
        20,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.full_name).toBe('Alice Smith');
      expect(result.data[0]!.prediction?.risk_score).toBe(65);
      expect(result.data[0]!.error).toBeNull();
      expect(result.meta.total).toBe(1);
      expect(mockAnthropic.createMessage).not.toHaveBeenCalled();
    });

    it('records errors per-student instead of failing the whole batch', async () => {
      mockTx.student.findMany.mockResolvedValue([
        {
          id: STUDENT_ID,
          student_number: 'S-001',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      ]);
      mockTx.student.count.mockResolvedValue(1);
      mockTx.student.findFirst.mockResolvedValue(null); // student not found in scope

      const result = await service.bulkPredictStudentRisk(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        1,
        20,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.prediction).toBeNull();
      expect(result.data[0]!.error).toBeTruthy();
    });
  });

  // ─── Legacy predictTrend (kept for `POST /v1/reports/ai/predict`) ───────

  describe('predictTrend (legacy)', () => {
    it('returns a TrendPrediction on the happy path', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              expected: [82, 84, 86],
              optimistic: [88, 90, 92],
              pessimistic: [75, 77, 79],
              confidence: 'high',
              narrative: 'Trending upward.',
            }),
          },
        ],
      });

      const result = await service.predictTrend(TENANT_ID, [{ x: 1 }], 'attendance', 3);

      expect(result.expected).toEqual([82, 84, 86]);
      expect(result.confidence).toBe('high');
      expect(result.periods_ahead).toBe(3);
    });

    it('returns a low-confidence empty payload when the response is unparseable', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json {{' }],
      });

      const result = await service.predictTrend(TENANT_ID, [], 'attendance', 3);

      expect(result.expected).toEqual([]);
      expect(result.confidence).toBe('low');
      expect(result.narrative).toBe('Unable to generate prediction at this time.');
    });

    it('throws AI_SERVICE_UNAVAILABLE when Anthropic is not configured', async () => {
      mockAnthropic.isConfigured = false;

      await expect(
        service.predictTrend(TENANT_ID, [], 'attendance', 3),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws AI_FEATURE_DISABLED when the legacy settings toggle is off', async () => {
      mockSettings.getSettings.mockResolvedValue({ ai: { predictionsEnabled: false } });

      await expect(
        service.predictTrend(TENANT_ID, [], 'attendance', 3),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: 'AI_FEATURE_DISABLED' }),
        }),
      });
    });
  });
});
