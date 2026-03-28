import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

function buildMockAnthropic(responseText = '{"suggested_score": 85, "confidence": "high", "reasoning": "Good work"}') {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
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
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

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
      await service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'image/jpeg');
    } catch (err) {
      const response = (err as ServiceUnavailableException).getResponse() as {
        error: { code: string };
      };
      expect(response.error.code).toBe('AI_FEATURE_DISABLED');
    }
  });

  it('should throw BadRequestException for unsupported mime type', async () => {
    await expect(
      service.gradeInline(TENANT_ID, ASSESSMENT_ID, STUDENT_ID, Buffer.from('img'), 'application/pdf'),
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
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();
    service = module.get<AiGradingService>(AiGradingService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();

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
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic('not json at all');

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
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<AiGradingService>(AiGradingService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

    await expect(
      service.gradeBatch(TENANT_ID, ASSESSMENT_ID, []),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw AI_FEATURE_DISABLED when gradingEnabled is false', async () => {
    mockSettings.getSettings.mockResolvedValue({ ai: { gradingEnabled: false } });

    await expect(
      service.gradeBatch(TENANT_ID, ASSESSMENT_ID, []),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.gradeBatch(TENANT_ID, ASSESSMENT_ID, []),
    ).rejects.toThrow(NotFoundException);
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
