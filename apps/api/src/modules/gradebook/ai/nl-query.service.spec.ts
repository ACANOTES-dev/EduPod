import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';

import { NlQueryService } from './nl-query.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: { findMany: jest.fn() },
    grade: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
    nlQueryHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function buildMockSettingsService(nlQueriesEnabled = true) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      ai: { nlQueriesEnabled },
    }),
  };
}

function buildMockAnthropic(responseText: string) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  };
}

// ─── processQuery Tests ───────────────────────────────────────────────────────

describe('NlQueryService — processQuery', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockSettings = buildMockSettingsService(true);

    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.nlQueryHistory.create.mockResolvedValue({ id: 'qh-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

    await expect(
      service.processQuery(TENANT_ID, USER_ID, 'show all students'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw AI_FEATURE_DISABLED when nlQueriesEnabled is false', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'student', filters: [], select: [], limit: 50 }),
    );
    mockSettings.getSettings.mockResolvedValue({ ai: { nlQueriesEnabled: false } });

    await expect(
      service.processQuery(TENANT_ID, USER_ID, 'show all students'),
    ).rejects.toThrow(ServiceUnavailableException);

    try {
      await service.processQuery(TENANT_ID, USER_ID, 'show all students');
    } catch (err) {
      const response = (err as ServiceUnavailableException).getResponse() as {
        error: { code: string };
      };
      expect(response.error.code).toBe('AI_FEATURE_DISABLED');
    }
  });

  it('should return structured query result with data and query_id for student entity', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'student', filters: [], select: ['first_name', 'last_name'], limit: 50 }),
    );

    mockPrisma.student.findMany.mockResolvedValue([
      {
        id: 's1',
        first_name: 'Ali',
        last_name: 'Hassan',
        student_number: '1001',
        year_group: { name: 'Grade 5' },
        homeroom_class: { name: '5A' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'show all students');

    expect(result.question).toBe('show all students');
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.structured_query.entity).toBe('student');
    expect(typeof result.query_id).toBe('string');
  });

  it('should handle grade entity queries', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'grade', filters: [], select: ['raw_score'], limit: 50 }),
    );

    mockPrisma.grade.findMany.mockResolvedValue([
      {
        id: 'g1',
        raw_score: 78,
        is_missing: false,
        ai_assisted: false,
        assessment: {
          title: 'Quiz 1',
          max_score: 100,
          subject: { name: 'Math' },
        },
        student: { first_name: 'Ali', last_name: 'Hassan', student_number: '1001' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'show recent grades');

    expect(result.structured_query.entity).toBe('grade');
    expect(result.data).toHaveLength(1);
  });

  it('should throw BadRequestException when AI returns unparseable JSON', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic('this is not json');

    await expect(
      service.processQuery(TENANT_ID, USER_ID, 'show data'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when AI returns unsupported entity', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'teacher', filters: [], select: [], limit: 50 }),
    );

    await expect(
      service.processQuery(TENANT_ID, USER_ID, 'show teachers'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should cap query limit at 200', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'student', filters: [], select: [], limit: 9999 }),
    );

    mockPrisma.student.findMany.mockResolvedValue([]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get all students');

    expect(result.structured_query.limit).toBe(200);
  });

  it('should log AI processing to audit trail', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'student', filters: [], select: ['first_name'], limit: 50 }),
    );

    mockPrisma.student.findMany.mockResolvedValue([]);

    await service.processQuery(TENANT_ID, USER_ID, 'show all students');

    const mockLog = service['aiAuditService'].log as jest.Mock;
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_nl_query',
        subjectType: null,
        subjectId: null,
        tokenised: true,
        modelUsed: 'claude-sonnet-4-6-20250514',
        inputDataCategories: ['gradebook_schema'],
      }),
    );
  });

  it('should not throw if saving query history fails', async () => {
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic(
      JSON.stringify({ entity: 'student', filters: [], select: [], limit: 50 }),
    );

    mockPrisma.nlQueryHistory.create.mockRejectedValue(new Error('DB error'));

    // Should still succeed — history is non-critical
    await expect(
      service.processQuery(TENANT_ID, USER_ID, 'show students'),
    ).resolves.not.toThrow();
  });
});

// ─── getQueryHistory Tests ────────────────────────────────────────────────────

describe('NlQueryService — getQueryHistory', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated query history', async () => {
    mockPrisma.nlQueryHistory.findMany.mockResolvedValue([
      { id: 'qh-1', question: 'show students', result_count: 5, created_at: new Date() },
    ]);
    mockPrisma.nlQueryHistory.count.mockResolvedValue(1);

    const result = await service.getQueryHistory(TENANT_ID, USER_ID, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });

  it('should return empty results when no history exists', async () => {
    mockPrisma.nlQueryHistory.findMany.mockResolvedValue([]);
    mockPrisma.nlQueryHistory.count.mockResolvedValue(0);

    const result = await service.getQueryHistory(TENANT_ID, USER_ID, 1, 20);

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});
