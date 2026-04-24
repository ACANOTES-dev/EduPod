import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  ASK_AI_ERROR_CODES,
  ASK_AI_RATE_LIMIT_PER_HOUR,
} from '@school/shared/reports';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ReportsSubjectRegistryService } from '../subject-registry/reports-subject-registry.service';
import type { SubjectDescriptor } from '../subject-registry/types';

import { AiAskAiService } from './ai-ask-ai.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => prisma,
}));

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const STUDENT_SUBJECT: SubjectDescriptor = {
  key: 'student',
  label_key: 'reports.subjects.student',
  icon_name: 'GraduationCap',
  primary_model: 'Student',
  fields: [
    {
      id: 'student.identity.first_name',
      label_key: 'reports.fields.student.identity.first_name',
      domain: 'identity',
      type: 'string',
      filterable: true,
      groupable: false,
      resolver: 'identity.first_name',
    },
    {
      id: 'student.identity.last_name',
      label_key: 'reports.fields.student.identity.last_name',
      domain: 'identity',
      type: 'string',
      filterable: true,
      groupable: false,
      resolver: 'identity.last_name',
    },
    {
      id: 'student.identity.id',
      label_key: 'reports.fields.student.identity.id',
      domain: 'identity',
      type: 'string',
      aggregations: ['count'],
      filterable: false,
      groupable: false,
      resolver: 'identity.id',
    },
    {
      id: 'student.enrolment.year_group',
      label_key: 'reports.fields.student.enrolment.year_group',
      domain: 'enrolment',
      type: 'enum',
      filterable: true,
      groupable: true,
      resolver: 'enrolment.year_group',
    },
    {
      id: 'student.attendance_summary.attendance_rate',
      label_key: 'reports.fields.student.attendance.rate',
      domain: 'attendance_summary',
      type: 'number',
      aggregations: ['avg', 'min', 'max'],
      filterable: true,
      groupable: false,
      resolver: 'attendance.rate',
    },
  ],
};

const VALID_AI_RESPONSE = JSON.stringify({
  subject: 'student',
  columns: [
    { field_id: 'student.identity.first_name' },
    { field_id: 'student.identity.last_name' },
  ],
  filters: {
    combinator: 'and',
    filters: [
      {
        field_id: 'student.enrolment.year_group',
        operator: 'equals',
        value: 'Year 10',
      },
    ],
  },
  rationale: 'Per-student listing filtered to Year 10.',
  confidence: 'high',
  warnings: [],
});

interface MockRedis {
  store: Map<string, string>;
  counters: Map<string, number>;
  get: jest.Mock;
  setex: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
}

function buildMockRedis(): MockRedis {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  return {
    store,
    counters,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => 1),
  };
}

describe('AiAskAiService', () => {
  let service: AiAskAiService;
  let mockPrisma: ReturnType<typeof buildPrismaMock>;
  let mockRedis: MockRedis;
  let mockAnthropic: { isConfigured: boolean; createMessage: jest.Mock };
  let mockRegistry: { getAllSubjects: jest.Mock };

  function buildPrismaMock() {
    const aiAskAiHistory = {
      create: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: 'hist-1',
        ...args.data,
      })) as jest.Mock,
      findMany: jest.fn().mockResolvedValue([] as unknown[]) as jest.Mock,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) as jest.Mock,
    };
    const aiProcessingLog = {
      create: jest.fn().mockResolvedValue({}) as jest.Mock,
    };
    return {
      aiAskAiHistory,
      aiProcessingLog,
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ aiAskAiHistory, aiProcessingLog }),
      ),
    };
  }

  beforeEach(async () => {
    mockPrisma = buildPrismaMock();
    mockRedis = buildMockRedis();
    mockAnthropic = {
      isConfigured: true,
      createMessage: jest.fn(),
    };
    mockRegistry = {
      getAllSubjects: jest.fn().mockReturnValue([STUDENT_SUBJECT]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAskAiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: { getClient: () => mockRedis } },
        { provide: AnthropicClientService, useValue: mockAnthropic },
        { provide: ReportsSubjectRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<AiAskAiService>(AiAskAiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('translate', () => {
    it('translates a valid query end-to-end', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: VALID_AI_RESPONSE }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      });

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'Year 10 students with first and last name',
      );

      expect(result.query).not.toBeNull();
      expect(result.query?.subject).toBe('student');
      expect(result.query?.columns.length).toBe(2);
      expect(result.confidence).toBe('high');
      expect(result.cache_hit).toBe(false);
      expect(mockPrisma.aiAskAiHistory.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.aiProcessingLog.create).toHaveBeenCalledTimes(1);
    });

    it('returns cache hit on subsequent identical calls', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: VALID_AI_RESPONSE }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const first = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'Year 10 listing',
      );
      expect(first.cache_hit).toBe(false);

      const second = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'Year 10 listing',
      );
      expect(second.cache_hit).toBe(true);
      expect(mockAnthropic.createMessage).toHaveBeenCalledTimes(1);
    });

    it('returns query=null on malformed AI JSON', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json {' }],
      });

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'List Year 10 students',
      );

      expect(result.query).toBeNull();
      expect(result.confidence).toBe('low');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.join(' ')).toMatch(/JSON/);
    });

    it('returns query=null when AI proposes an unknown subject', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              subject: 'mystery_subject',
              columns: [{ field_id: 'mystery_subject.foo' }],
              rationale: '',
              confidence: 'low',
              warnings: [],
            }),
          },
        ],
      });

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'mystery query',
      );
      expect(result.query).toBeNull();
      expect(result.warnings.join(' ')).toMatch(/unknown subject/i);
    });

    it('drops unknown columns and warns', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              subject: 'student',
              columns: [
                { field_id: 'student.identity.first_name' },
                { field_id: 'student.does_not_exist' },
              ],
              rationale: '',
              confidence: 'high',
              warnings: [],
            }),
          },
        ],
      });

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'list students',
      );

      expect(result.query).not.toBeNull();
      expect(result.query?.columns).toHaveLength(1);
      expect(result.confidence).not.toBe('high');
      expect(result.warnings.join(' ')).toMatch(/Dropped 1 column/);
    });

    it('drops a filter whose operator is not legal for the field type', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              subject: 'student',
              columns: [{ field_id: 'student.identity.first_name' }],
              filters: {
                combinator: 'and',
                filters: [
                  {
                    field_id: 'student.identity.first_name',
                    operator: 'greater_than',
                    value: 'A',
                  },
                ],
              },
              rationale: '',
              confidence: 'high',
              warnings: [],
            }),
          },
        ],
      });

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'invalid op',
      );
      expect(result.warnings.join(' ')).toMatch(/Dropped 1 filter/);
    });

    it('throws 429 once the rate limit is exceeded', async () => {
      mockAnthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: VALID_AI_RESPONSE }],
      });

      for (let i = 0; i < ASK_AI_RATE_LIMIT_PER_HOUR; i++) {
        await service.translate(
          TENANT_ID,
          USER_ID,
          ['reports.ai.ask_ai'],
          `query ${i}`,
        );
      }

      // 21st call: capture and check via duck-typing (avoids cross-realm
      // instanceof issues that bite Jest on @nestjs/common exception classes).
      let caught: unknown;
      try {
        await service.translate(
          TENANT_ID,
          USER_ID,
          ['reports.ai.ask_ai'],
          'one too many',
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      const httpErr = caught as { getStatus?: () => number; getResponse?: () => unknown };
      expect(typeof httpErr.getStatus).toBe('function');
      expect(httpErr.getStatus?.()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = httpErr.getResponse?.() as { code: string };
      expect(body.code).toBe(ASK_AI_ERROR_CODES.RATE_LIMITED);
    });

    it('throws ServiceUnavailable when Anthropic is not configured', async () => {
      mockAnthropic.isConfigured = false;
      let caught: unknown;
      try {
        await service.translate(
          TENANT_ID,
          USER_ID,
          ['reports.ai.ask_ai'],
          'anything',
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      // Debug: surface the error to know what was thrown
      // eslint-disable-next-line no-console
      console.log('Caught error type:', caught?.constructor?.name, caught);
      const httpErr = caught as { getStatus?: () => number; getResponse?: () => unknown; message?: string };
      expect(typeof httpErr.getStatus).toBe('function');
      expect(httpErr.getStatus?.()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = httpErr.getResponse?.() as { code: string };
      expect(body.code).toBe(ASK_AI_ERROR_CODES.AI_UNAVAILABLE);
    });

    it('returns a soft failure when AI throws (no exception bubbled)', async () => {
      mockAnthropic.createMessage.mockRejectedValue(new Error('Anthropic 500'));
      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        ['reports.ai.ask_ai'],
        'something',
      );
      expect(result.query).toBeNull();
      expect(result.confidence).toBe('low');
      expect(mockPrisma.aiAskAiHistory.create).toHaveBeenCalledTimes(1);
    });

    it('skips Anthropic when no subjects are visible', async () => {
      mockRegistry.getAllSubjects.mockReturnValue([]);

      const result = await service.translate(
        TENANT_ID,
        USER_ID,
        [],
        'list students',
      );

      expect(result.query).toBeNull();
      expect(result.warnings.join(' ')).toMatch(/permission/i);
      expect(mockAnthropic.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns the user history with ISO timestamps', async () => {
      const ts = new Date('2026-04-24T12:00:00Z');
      mockPrisma.aiAskAiHistory.findMany.mockResolvedValueOnce([
        {
          id: 'h1',
          query_text: 'list students',
          result_json: {
            query: null,
            rationale: '',
            confidence: 'low',
            warnings: [],
          },
          was_saved: false,
          created_at: ts,
        },
      ] as unknown[]);

      const history = await service.getHistory(TENANT_ID, USER_ID);
      expect(history).toHaveLength(1);
      expect(history[0]?.created_at).toBe(ts.toISOString());
      expect(mockPrisma.aiAskAiHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, user_id: USER_ID },
          orderBy: { created_at: 'desc' },
          take: 20,
        }),
      );
    });

    it('clamps limit to 100', async () => {
      await service.getHistory(TENANT_ID, USER_ID, 500);
      expect(mockPrisma.aiAskAiHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('clamps limit to at least 1', async () => {
      await service.getHistory(TENANT_ID, USER_ID, 0);
      expect(mockPrisma.aiAskAiHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  describe('markHistoryAsSaved', () => {
    it('returns true when a row was updated', async () => {
      mockPrisma.aiAskAiHistory.updateMany.mockResolvedValueOnce({ count: 1 });
      const updated = await service.markHistoryAsSaved(TENANT_ID, USER_ID, 'hist-1');
      expect(updated).toBe(true);
      expect(mockPrisma.aiAskAiHistory.updateMany).toHaveBeenCalledWith({
        where: { id: 'hist-1', tenant_id: TENANT_ID, user_id: USER_ID },
        data: { was_saved: true },
      });
    });

    it('returns false when no row was updated', async () => {
      mockPrisma.aiAskAiHistory.updateMany.mockResolvedValueOnce({ count: 0 });
      const updated = await service.markHistoryAsSaved(
        TENANT_ID,
        USER_ID,
        'hist-missing',
      );
      expect(updated).toBe(false);
    });
  });
});
