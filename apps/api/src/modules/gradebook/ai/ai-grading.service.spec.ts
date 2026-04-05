import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { AiGradingService } from './ai-grading.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'assessment-1';
const STUDENT_ID = 'student-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    assessment: { findFirst: jest.fn() },
    aiGradingInstruction: { findFirst: jest.fn() },
  };
}

function buildMockSettingsService(gradingEnabled = true) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      ai: { gradingEnabled },
    }),
  };
}

function buildMockRedis(incrValue = 1) {
  const mockClient = {
    incr: jest.fn().mockResolvedValue(incrValue),
    expire: jest.fn().mockResolvedValue(1),
  };
  return {
    getClient: jest.fn().mockReturnValue(mockClient),
    _client: mockClient,
  };
}

function buildMockAnthropicClient(
  responseText = '{"suggested_score": 85, "confidence": "high", "reasoning": "Good work"}',
) {
  return {
    isConfigured: true,
    createMessage: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: responseText }],
    }),
  };
}

function buildMockConsentService(granted = true) {
  return {
    hasConsent: jest.fn().mockResolvedValue(granted),
  };
}

const baseAssessment = {
  id: ASSESSMENT_ID,
  title: 'Math Quiz',
  max_score: 100,
  class_id: 'class-1',
  subject_id: 'subject-1',
  class_entity: { id: 'class-1', name: 'Grade 5A' },
  subject: { id: 'subject-1', name: 'Math' },
  rubric_template: null,
  ai_references: [],
};

// ─── gradeInline Tests ────────────────────────────────────────────────────────

describe('AiGradingService — gradeInline', () => {
  let service: AiGradingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;
  let mockConsentService: ReturnType<typeof buildMockConsentService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis(1);
    mockSettings = buildMockSettingsService(true);
    mockConsentService = buildMockConsentService(true);

    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ConsentService, useValue: mockConsentService },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
    // AnthropicClientService is provided via DI
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service['anthropicClient'] as unknown as { isConfigured: boolean }).isConfigured = false;

    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw AI_FEATURE_DISABLED when gradingEnabled is false', async () => {
    mockSettings.getSettings.mockResolvedValue({ ai: { gradingEnabled: false } });

    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ServiceUnavailableException);

    try {
      await service.gradeInline(
        TENANT_ID,
        ASSESSMENT_ID,
        STUDENT_ID,
        Buffer.from('img'),
        'image/jpeg',
      );
    } catch (err) {
      const response = (err as ServiceUnavailableException).getResponse() as {
        error: { code: string };
      };
      expect(response.error.code).toBe('AI_FEATURE_DISABLED');
    }
  });

  it('should throw BadRequestException for unsupported mime type', async () => {
    await expect(
      service.gradeInline(
        TENANT_ID,
        ASSESSMENT_ID,
        STUDENT_ID,
        Buffer.from('img'),
        'application/pdf',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw ForbiddenException when AI grading consent is not active', async () => {
    mockConsentService.hasConsent.mockResolvedValue(false);

    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return suggestion with correct student_id on success', async () => {
    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/png',
    );

    expect(result.student_id).toBe(STUDENT_ID);
    expect(result.suggested_score).toBe(85);
    expect(result.confidence).toBe('high');
  });

  it('should throw BadRequestException when daily rate limit is exceeded', async () => {
    mockRedis = buildMockRedis(201);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ConsentService, useValue: mockConsentService },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();
    service = module.get<AiGradingService>(AiGradingService);
    // AnthropicClientService is provided via DI

    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should log AI processing to audit trail', async () => {
    await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/png',
    );

    const mockLog = service['aiAuditService'].log as jest.Mock;
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_grading',
        subjectType: 'student',
        subjectId: STUDENT_ID,
        tokenised: true,
        modelUsed: 'claude-sonnet-4-6-20250514',
        inputDataCategories: ['student_work_image', 'assessment_rubric'],
      }),
    );
  });

  it('should return low confidence and null score when AI returns invalid JSON', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.confidence).toBe('low');
    expect(result.suggested_score).toBeNull();
  });
});

// ─── gradeBatch Tests ─────────────────────────────────────────────────────────

describe('AiGradingService — gradeBatch', () => {
  let service: AiGradingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;
  let mockConsentService: ReturnType<typeof buildMockConsentService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis(1);
    mockSettings = buildMockSettingsService(true);
    mockConsentService = buildMockConsentService(true);

    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ConsentService, useValue: mockConsentService },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
    // AnthropicClientService is provided via DI
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service['anthropicClient'] as unknown as { isConfigured: boolean }).isConfigured = false;

    await expect(service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [])).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw AI_FEATURE_DISABLED when gradingEnabled is false', async () => {
    mockSettings.getSettings.mockResolvedValue({ ai: { gradingEnabled: false } });

    await expect(service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [])).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return low confidence result for unsupported mime type', async () => {
    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { student_id: STUDENT_ID, image_buffer: Buffer.from('img'), mime_type: 'application/pdf' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.confidence).toBe('low');
    expect(results[0]?.suggested_score).toBeNull();
  });

  it('should return a consent-required result for students without active consent', async () => {
    mockConsentService.hasConsent.mockResolvedValue(false);

    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { student_id: STUDENT_ID, image_buffer: Buffer.from('img'), mime_type: 'image/jpeg' },
    ]);

    expect(results[0]?.suggested_score).toBeNull();
    expect(results[0]?.reasoning).toContain('consent');
  });

  it('should return suggestions for all valid images', async () => {
    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { student_id: 's1', image_buffer: Buffer.from('img1'), mime_type: 'image/jpeg' },
      { student_id: 's2', image_buffer: Buffer.from('img2'), mime_type: 'image/png' },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.student_id).toBe('s1');
    expect(results[1]?.student_id).toBe('s2');
  });

  it('edge: empty images array returns empty results', async () => {
    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, []);

    expect(results).toHaveLength(0);
  });
});

// ─── isAllowedMimeType Tests ──────────────────────────────────────────────────

describe('AiGradingService — isAllowedMimeType (static)', () => {
  it('should return true for supported types', () => {
    expect(AiGradingService.isAllowedMimeType('image/jpeg')).toBe(true);
    expect(AiGradingService.isAllowedMimeType('image/png')).toBe(true);
    expect(AiGradingService.isAllowedMimeType('image/gif')).toBe(true);
    expect(AiGradingService.isAllowedMimeType('image/webp')).toBe(true);
  });

  it('should return false for unsupported types', () => {
    expect(AiGradingService.isAllowedMimeType('application/pdf')).toBe(false);
    expect(AiGradingService.isAllowedMimeType('text/plain')).toBe(false);
    expect(AiGradingService.isAllowedMimeType('')).toBe(false);
  });
});

// ─── parseGradingResponse Tests ──────────────────────────────────────────────

describe('AiGradingService — parseGradingResponse (via gradeInline)', () => {
  let service: AiGradingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis(1) },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should strip markdown code fences from response', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n{"suggested_score": 90, "confidence": "high", "reasoning": "Excellent"}\n```',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.suggested_score).toBe(90);
    expect(result.confidence).toBe('high');
  });

  it('should return null score when suggested_score exceeds max_score', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"suggested_score": 200, "confidence": "high", "reasoning": "Over max"}',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.suggested_score).toBeNull();
  });

  it('should return null score when suggested_score is negative', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"suggested_score": -5, "confidence": "medium", "reasoning": "Invalid"}',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.suggested_score).toBeNull();
  });

  it('should return medium confidence when AI returns medium confidence', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"suggested_score": 70, "confidence": "medium", "reasoning": "Decent"}',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.confidence).toBe('medium');
  });

  it('should default to low confidence when confidence is unknown string', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"suggested_score": 70, "confidence": "unknown", "reasoning": "Uncertain"}',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.confidence).toBe('low');
  });

  it('should include criterion_scores when AI returns them', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggested_score: 85,
            confidence: 'high',
            reasoning: 'Good',
            criterion_scores: [{ criterion_id: 'c1', points: 4, reasoning: 'Well done' }],
          }),
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.criterion_scores).toHaveLength(1);
    expect(result.criterion_scores![0]!.criterion_id).toBe('c1');
  });

  it('should omit criterion_scores when AI does not return them', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"suggested_score": 85, "confidence": "high", "reasoning": "Good"}',
        },
      ],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.criterion_scores).toBeUndefined();
  });

  it('should handle response with no text blocks', async () => {
    (
      service['anthropicClient'] as unknown as { createMessage: jest.Mock }
    ).createMessage.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tool-1' }],
    });

    const result = await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(result.suggested_score).toBeNull();
    expect(result.confidence).toBe('low');
  });
});

// ─── buildGradingPrompt Tests (via gradeInline) ──────────────────────────────

describe('AiGradingService — buildGradingPrompt with context', () => {
  let service: AiGradingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAnthropicClient: ReturnType<typeof buildMockAnthropicClient>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAnthropicClient = buildMockAnthropicClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis(1) },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: mockAnthropicClient },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should include instruction text in prompt when instruction exists', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      instruction_text: 'Grade on structure and clarity',
    });

    await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    const callArgs = mockAnthropicClient.createMessage.mock.calls[0]![0] as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    const textContent = callArgs.messages[0]!.content.find(
      (c) => c.text !== undefined,
    ) as { text: string };
    expect(textContent.text).toContain('Grade on structure and clarity');
  });

  it('should include rubric criteria in prompt when rubric template exists', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      rubric_template: {
        id: 'rubric-1',
        criteria_json: [{ id: 'c1', name: 'Content', max_points: 4 }],
      },
    });
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    await service.gradeInline(
      TENANT_ID,
      ASSESSMENT_ID,
      STUDENT_ID,
      Buffer.from('img'),
      'image/jpeg',
    );

    const callArgs = mockAnthropicClient.createMessage.mock.calls[0]![0] as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    const textContent = callArgs.messages[0]!.content.find(
      (c) => c.text !== undefined,
    ) as { text: string };
    expect(textContent.text).toContain('Rubric Criteria');
    expect(textContent.text).toContain('Content');
  });
});

// ─── gradeBatch — additional error handling ──────────────────────────────────

describe('AiGradingService — gradeBatch additional branches', () => {
  let service: AiGradingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const mockAnthropicClient = buildMockAnthropicClient();
    mockAnthropicClient.createMessage.mockRejectedValue(new Error('API timeout'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis(1) },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: mockAnthropicClient },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return low confidence result when AI API throws an error in batch', async () => {
    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { student_id: STUDENT_ID, image_buffer: Buffer.from('img'), mime_type: 'image/jpeg' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.confidence).toBe('low');
    expect(results[0]!.reasoning).toContain('AI grading failed');
    expect(results[0]!.suggested_score).toBeNull();
  });

  it('should use null for student_id when image has no student_id', async () => {
    const results = await service.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { image_buffer: Buffer.from('img'), mime_type: 'image/jpeg' },
    ]);

    expect(results[0]!.student_id).toBeNull();
  });

  it('should skip consent check when batch image has no student_id', async () => {
    // Build a service with a working anthropic client for this test
    const mp = buildMockPrisma();
    mp.assessment.findFirst.mockResolvedValue(baseAssessment);
    mp.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const workingAnthropicClient = buildMockAnthropicClient();
    workingAnthropicClient.createMessage.mockRejectedValue(new Error('API error'));

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mp },
        { provide: RedisService, useValue: buildMockRedis(1) },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: workingAnthropicClient },
      ],
    }).compile();
    const svc = mod.get<AiGradingService>(AiGradingService);

    // No student_id means consent check is skipped, but API error means it catches
    const results = await svc.gradeBatch(TENANT_ID, ASSESSMENT_ID, [
      { image_buffer: Buffer.from('img'), mime_type: 'image/jpeg' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.student_id).toBeNull();
    expect(results[0]!.reasoning).toContain('AI grading failed');
  });
});

// ─── enforceRateLimit — expire branch ────────────────────────────────────────

describe('AiGradingService — enforceRateLimit expire on first call', () => {
  it('should call expire when count is 1 (first call of the day)', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const mockRedis = buildMockRedis(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();
    const svc = module.get<AiGradingService>(AiGradingService);

    await svc.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg');

    // The expire should have been called because incr returned 1
    expect(mockRedis._client.expire).toHaveBeenCalledWith(
      expect.stringContaining('gradebook:ai_grading:'),
      86400,
    );
  });

  it('should not call expire when count is > 1 (not first call)', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    const mockRedis = buildMockRedis(2);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettingsService(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
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
        { provide: AnthropicClientService, useValue: buildMockAnthropicClient() },
      ],
    }).compile();
    const svc = module.get<AiGradingService>(AiGradingService);

    await svc.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg');

    expect(mockRedis._client.expire).not.toHaveBeenCalled();
  });
});
