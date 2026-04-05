import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../../common/tests/mock-facades';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
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

function buildMockAnthropicClient(responseText: string, configured = true) {
  return {
    isConfigured: configured,
    createMessage: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: responseText }],
    }),
  };
}

// ─── processQuery Tests ───────────────────────────────────────────────────────

describe('NlQueryService — processQuery', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;
  let mockAnthropicClientService: ReturnType<typeof buildMockAnthropicClient>;
  const mockStudentFacade = { findManyGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockSettings = buildMockSettingsService(true);
    mockAnthropicClientService = buildMockAnthropicClient(
      JSON.stringify({ entity: 'student', filters: [], select: [], limit: 50 }),
    );

    mockStudentFacade.findManyGeneric.mockResolvedValue([]);
    mockPrisma.nlQueryHistory.create.mockResolvedValue({ id: 'qh-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    mockAnthropicClientService.isConfigured = false;

    await expect(service.processQuery(TENANT_ID, USER_ID, 'show all students')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw AI_FEATURE_DISABLED when nlQueriesEnabled is false', async () => {
    mockSettings.getSettings.mockResolvedValue({ ai: { nlQueriesEnabled: false } });

    await expect(service.processQuery(TENANT_ID, USER_ID, 'show all students')).rejects.toThrow(
      ServiceUnavailableException,
    );

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
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            select: ['first_name', 'last_name'],
            limit: 50,
          }),
        },
      ],
    });

    mockStudentFacade.findManyGeneric.mockResolvedValue([
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
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'grade', filters: [], select: ['raw_score'], limit: 50 }),
        },
      ],
    });

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
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'this is not json' }],
    });

    await expect(service.processQuery(TENANT_ID, USER_ID, 'show data')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when AI returns unsupported entity', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'teacher', filters: [], select: [], limit: 50 }),
        },
      ],
    });

    await expect(service.processQuery(TENANT_ID, USER_ID, 'show teachers')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should cap query limit at 200', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'student', filters: [], select: [], limit: 9999 }),
        },
      ],
    });

    mockPrisma.student.findMany.mockResolvedValue([]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get all students');

    expect(result.structured_query.limit).toBe(200);
  });

  it('should log AI processing to audit trail', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            select: ['first_name'],
            limit: 50,
          }),
        },
      ],
    });

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
    mockPrisma.nlQueryHistory.create.mockRejectedValue(new Error('DB error'));

    // Should still succeed — history is non-critical
    await expect(service.processQuery(TENANT_ID, USER_ID, 'show students')).resolves.not.toThrow();
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
        ...MOCK_FACADE_PROVIDERS,
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient('{}') },
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

// ─── parseStructuredQuery branch tests ──────────────────────────────────────

describe('NlQueryService — parseStructuredQuery branches', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAnthropicClientService: ReturnType<typeof buildMockAnthropicClient>;
  const mockStudentFacade = { findManyGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAnthropicClientService = buildMockAnthropicClient('{}', true);
    mockStudentFacade.findManyGeneric.mockResolvedValue([]);
    mockPrisma.nlQueryHistory.create.mockResolvedValue({ id: 'qh-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockResolvedValue({ processedData: {}, tokenMap: new Map() }),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should strip markdown code fences from AI response', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{"entity":"student","filters":[],"select":[],"limit":10}\n```',
        },
      ],
    });

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get students');

    expect(result.structured_query.entity).toBe('student');
    expect(result.structured_query.limit).toBe(10);
  });

  it('should default limit to 50 when not a number', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            select: [],
            limit: 'not-a-number',
          }),
        },
      ],
    });

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get students');

    expect(result.structured_query.limit).toBe(50);
  });

  it('should handle non-array filters gracefully', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: 'not-array',
            select: 'also-not-array',
            limit: 50,
          }),
        },
      ],
    });

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get students');

    expect(result.structured_query.filters).toEqual([]);
    expect(result.structured_query.select).toEqual([]);
  });

  it('should handle non-array aggregations and sort gracefully', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            aggregations: 'not-array',
            select: [],
            sort: 'not-array',
            limit: 50,
          }),
        },
      ],
    });

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get students');

    expect(result.structured_query.aggregations).toBeUndefined();
    expect(result.structured_query.sort).toBeUndefined();
  });

  it('should handle empty entity string', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: '', filters: [], select: [], limit: 50 }),
        },
      ],
    });

    await expect(service.processQuery(TENANT_ID, USER_ID, 'anything')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should handle response with no text blocks', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'test', input: {} }],
    });

    await expect(service.processQuery(TENANT_ID, USER_ID, 'anything')).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── executeQuery entity branches ────────────────────────────────────────────

describe('NlQueryService — assessment entity query', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAnthropicClientService: ReturnType<typeof buildMockAnthropicClient>;
  const mockStudentFacade = { findManyGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAnthropicClientService = buildMockAnthropicClient('{}', true);
    mockPrisma.nlQueryHistory.create.mockResolvedValue({ id: 'qh-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockResolvedValue({ processedData: {}, tokenMap: new Map() }),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should execute assessment entity query and map due_date', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'assessment', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Final Exam',
        max_score: 100,
        status: 'open',
        due_date: new Date('2026-04-15'),
        subject: { name: 'Math' },
        class_entity: { name: '5A' },
        academic_period: { name: 'Term 1' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'list assessments');

    expect(result.structured_query.entity).toBe('assessment');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      title: 'Final Exam',
      due_date: '2026-04-15',
      max_score: 100,
    });
  });

  it('should handle assessment with null due_date', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'assessment', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a2',
        title: 'Pop Quiz',
        max_score: 20,
        status: 'closed',
        due_date: null,
        subject: { name: 'Science' },
        class_entity: { name: '6B' },
        academic_period: { name: 'Term 2' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'list quizzes');

    expect(result.data[0]).toMatchObject({ due_date: null });
  });

  it('should execute period_grade entity query', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'period_grade', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        id: 'pg1',
        computed_value: 87.5,
        display_value: 'B+',
        student: { first_name: 'Ali', last_name: 'Hassan', student_number: 'S001' },
        subject: { name: 'Math' },
        class_entity: { name: '5A' },
        academic_period: { name: 'Term 1' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'show period grades');

    expect(result.structured_query.entity).toBe('period_grade');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      student: 'Ali Hassan',
      grade: 87.5,
      display_value: 'B+',
    });
  });

  it('should execute gpa_snapshot entity query', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'gpa_snapshot', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
      {
        id: 'gpa1',
        gpa_value: 3.75,
        credit_hours_total: 15,
        student: { first_name: 'Sara', last_name: 'Ahmed', student_number: 'S002' },
        academic_period: { name: 'Term 1' },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'show GPA snapshots');

    expect(result.structured_query.entity).toBe('gpa_snapshot');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      student: 'Sara Ahmed',
      gpa: 3.75,
      credit_hours: 15,
    });
  });

  it('should handle grade entity with null raw_score', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'grade', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      {
        id: 'g1',
        raw_score: null,
        is_missing: true,
        ai_assisted: false,
        assessment: { title: 'Quiz 1', max_score: 50, subject: { name: 'English' } },
        student: { first_name: 'Omar', last_name: 'Ali', student_number: null },
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'show missing grades');

    expect(result.data[0]).toMatchObject({
      raw_score: null,
      is_missing: true,
      student_number: null,
    });
  });

  it('should handle student query with null year_group and homeroom_class', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ entity: 'student', filters: [], select: [], limit: 50 }),
        },
      ],
    });
    mockStudentFacade.findManyGeneric.mockResolvedValue([
      {
        id: 's1',
        first_name: 'Test',
        last_name: 'Student',
        student_number: null,
        year_group: null,
        homeroom_class: null,
      },
    ]);

    const result = await service.processQuery(TENANT_ID, USER_ID, 'get students');

    expect(result.data[0]).toMatchObject({
      year_group: null,
      class: null,
      student_number: null,
    });
  });
});

// ─── applyFilters branch tests ──────────────────────────────────────────────

describe('NlQueryService — filter operations', () => {
  let service: NlQueryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAnthropicClientService: ReturnType<typeof buildMockAnthropicClient>;
  const mockStudentFacade = { findManyGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAnthropicClientService = buildMockAnthropicClient('{}', true);
    mockStudentFacade.findManyGeneric.mockResolvedValue([]);
    mockPrisma.nlQueryHistory.create.mockResolvedValue({ id: 'qh-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        NlQueryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockResolvedValue({ processedData: {}, tokenMap: new Map() }),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<NlQueryService>(NlQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should apply "ne" filter operation', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'status', op: 'ne', value: 'archived' }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'active students');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    expect(callArgs[1].where).toMatchObject({ status: { not: 'archived' } });
  });

  it('should apply "lt" filter operation', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'grade',
            filters: [{ field: 'raw_score', op: 'lt', value: 50 }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await service.processQuery(TENANT_ID, USER_ID, 'failing grades');

    expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ raw_score: { lt: 50 } }),
      }),
    );
  });

  it('should apply "lte" filter operation', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'grade',
            filters: [{ field: 'raw_score', op: 'lte', value: 60 }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await service.processQuery(TENANT_ID, USER_ID, 'grades below 60');

    expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ raw_score: { lte: 60 } }),
      }),
    );
  });

  it('should apply "gt" filter operation', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'grade',
            filters: [{ field: 'raw_score', op: 'gt', value: 90 }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await service.processQuery(TENANT_ID, USER_ID, 'top grades');

    expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ raw_score: { gt: 90 } }),
      }),
    );
  });

  it('should apply "gte" filter operation', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'grade',
            filters: [{ field: 'raw_score', op: 'gte', value: 80 }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await service.processQuery(TENANT_ID, USER_ID, 'A grades');

    expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ raw_score: { gte: 80 } }),
      }),
    );
  });

  it('should apply "in" filter operation with array value', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'status', op: 'in', value: ['active', 'enrolled'] }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'active or enrolled students');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    expect(callArgs[1].where).toMatchObject({ status: { in: ['active', 'enrolled'] } });
  });

  it('should skip "in" filter when value is not an array', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'status', op: 'in', value: 'not-an-array' }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'students');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    expect(callArgs[1].where).not.toHaveProperty('status');
  });

  it('should apply "contains" filter operation with string value', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'first_name', op: 'contains', value: 'Ali' }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'students named Ali');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    expect(callArgs[1].where).toMatchObject({
      first_name: { contains: 'Ali', mode: 'insensitive' },
    });
  });

  it('should skip "contains" filter when value is not a string', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'first_name', op: 'contains', value: 123 }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'students');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    expect(callArgs[1].where).not.toHaveProperty('first_name');
  });

  it('should skip dot-notation field filters', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [{ field: 'year_group.name', op: 'eq', value: 'Year 5' }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'year 5 students');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { where: Record<string, unknown> },
    ];
    // dot notation should be skipped
    expect(callArgs[1].where).not.toHaveProperty('year_group.name');
  });

  it('should use sort when provided in query', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            select: [],
            sort: [{ field: 'last_name', dir: 'desc' }],
            limit: 50,
          }),
        },
      ],
    });

    await service.processQuery(TENANT_ID, USER_ID, 'students sorted by name');

    const callArgs = mockStudentFacade.findManyGeneric.mock.calls[0] as [
      string,
      { orderBy: Record<string, string> },
    ];
    expect(callArgs[1].orderBy).toEqual({ last_name: 'desc' });
  });

  it('should use aggregations when provided as array', async () => {
    mockAnthropicClientService.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            entity: 'student',
            filters: [],
            aggregations: [{ fn: 'count', field: 'id', alias: 'total' }],
            select: [],
            limit: 50,
          }),
        },
      ],
    });

    const result = await service.processQuery(TENANT_ID, USER_ID, 'count students');

    expect(result.structured_query.aggregations).toHaveLength(1);
    expect(result.structured_query.aggregations![0]!.fn).toBe('count');
  });
});
