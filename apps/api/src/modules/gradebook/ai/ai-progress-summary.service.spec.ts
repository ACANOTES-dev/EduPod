import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { AiProgressSummaryService } from './ai-progress-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
  };
}

function buildMockRedis(cachedValue: string | null = null) {
  const client = {
    get: jest.fn().mockResolvedValue(cachedValue),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  };
  return { getClient: jest.fn().mockReturnValue(client), _client: client };
}

function buildMockSettings(aiEnabled: boolean, commentStyle = 'balanced') {
  return {
    getSettings: jest.fn().mockResolvedValue({
      ai: {
        progressSummariesEnabled: aiEnabled,
        commentStyle,
      },
    }),
  };
}

function buildMockAnthropic(summaryText = 'Ali has shown great progress this term.') {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: summaryText }],
      }),
    },
  };
}

function buildMockConsentService(granted = true) {
  return {
    hasConsent: jest.fn().mockResolvedValue(granted),
  };
}

const baseStudent = {
  id: STUDENT_ID,
  first_name: 'Ali',
  last_name: 'Hassan',
};

const basePeriod = {
  id: PERIOD_ID,
  name: 'Term 1',
};

const baseSnapshots = [
  {
    id: 'snap-1',
    student_id: STUDENT_ID,
    subject: { name: 'Math' },
    computed_value: 85,
    overridden_value: null,
    display_value: 'B+',
  },
];

const baseAttendance = [
  { status: 'present' },
  { status: 'present' },
  { status: 'absent_unexcused' },
];

// ─── generateSummary ──────────────────────────────────────────────────────────

describe('AiProgressSummaryService — generateSummary', () => {
  let service: AiProgressSummaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockConsentService: ReturnType<typeof buildMockConsentService>;

  function setupMocks(aiEnabled = true) {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(baseSnapshots);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue(baseAttendance);

    if (aiEnabled) {
      (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();
    }
  }

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockConsentService = buildMockConsentService(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProgressSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettings(true) },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<AiProgressSummaryService>(AiProgressSummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when Anthropic client is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

    await expect(
      service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw ServiceUnavailableException when AI feature is disabled for tenant', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProgressSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettings(false) },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();
    service = module.get<AiProgressSummaryService>(AiProgressSummaryService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();

    await expect(
      service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should return cached result when cache hit exists', async () => {
    const cached = {
      student_id: STUDENT_ID,
      period_id: PERIOD_ID,
      summary: 'Cached summary',
      locale: 'en',
      generated_at: new Date().toISOString(),
      cached: false,
    };
    mockRedis = buildMockRedis(JSON.stringify(cached));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProgressSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettings(true) },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();
    service = module.get<AiProgressSummaryService>(AiProgressSummaryService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();

    const result = await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en');

    expect(result.cached).toBe(true);
    expect(result.summary).toBe('Cached summary');
    // Should NOT call Anthropic when cached
    const anthropic = (service as unknown as Record<string, unknown>).anthropic as {
      messages: { create: jest.Mock };
    };
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when student is not found in DB', async () => {
    setupMocks();
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when AI progress summary consent is not active', async () => {
    setupMocks();
    mockConsentService.hasConsent.mockResolvedValue(false);

    await expect(
      service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should generate summary via Anthropic and cache the result', async () => {
    setupMocks();

    const result = await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en');

    expect(result.student_id).toBe(STUDENT_ID);
    expect(result.period_id).toBe(PERIOD_ID);
    expect(result.summary).toBe('Ali has shown great progress this term.');
    expect(result.cached).toBe(false);
    expect(mockRedis.getClient().set).toHaveBeenCalledWith(
      `ai:progress_summary:${TENANT_ID}:${STUDENT_ID}:${PERIOD_ID}`,
      expect.any(String),
      'EX',
      86400,
    );
  });

  it('should pass Arabic locale instruction when locale is ar', async () => {
    setupMocks();

    const mockCreate = (service as unknown as Record<string, unknown>).anthropic as {
      messages: { create: jest.Mock };
    };

    await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'ar');

    const callArgs = mockCreate.messages.create.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0]?.content).toContain('Arabic');
  });

  it('should return locale in the result matching the requested locale', async () => {
    setupMocks();

    const result = await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'ar');

    expect(result.locale).toBe('ar');
  });

  it('should log AI processing to audit trail', async () => {
    setupMocks();

    await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en');

    const mockLog = service['aiAuditService'].log as jest.Mock;
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_progress_summary',
        subjectType: 'student',
        subjectId: STUDENT_ID,
        tokenised: true,
        modelUsed: 'claude-sonnet-4-6-20250514',
        inputDataCategories: ['grades', 'attendance'],
      }),
    );
  });

  it('should handle empty snapshots gracefully (no grades recorded)', async () => {
    setupMocks();
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const result = await service.generateSummary(TENANT_ID, STUDENT_ID, PERIOD_ID, 'en');

    expect(result.summary).toBeDefined();

    const mockCreate = (service as unknown as Record<string, unknown>).anthropic as {
      messages: { create: jest.Mock };
    };
    const callArgs = mockCreate.messages.create.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0]?.content).toContain('No grades recorded yet');
  });
});

// ─── invalidateCache ──────────────────────────────────────────────────────────

describe('AiProgressSummaryService — invalidateCache', () => {
  let service: AiProgressSummaryService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    const mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProgressSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SettingsService, useValue: buildMockSettings(true) },
        { provide: ConsentService, useValue: buildMockConsentService(true) },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn().mockImplementation((_t: string, _p: string, data: unknown) => ({ processedData: data, tokenMap: new Map() })), processInbound: jest.fn().mockImplementation((_tokenMap: unknown, text: string) => text) } },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<AiProgressSummaryService>(AiProgressSummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete specific period cache key when periodId is provided', async () => {
    await service.invalidateCache(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(mockRedis.getClient().del).toHaveBeenCalledWith(
      `ai:progress_summary:${TENANT_ID}:${STUDENT_ID}:${PERIOD_ID}`,
    );
  });

  it('should scan and delete all period keys when no periodId is provided', async () => {
    const keys = [
      `ai:progress_summary:${TENANT_ID}:${STUDENT_ID}:period-1`,
      `ai:progress_summary:${TENANT_ID}:${STUDENT_ID}:period-2`,
    ];
    mockRedis.getClient().keys.mockResolvedValue(keys);

    await service.invalidateCache(TENANT_ID, STUDENT_ID);

    expect(mockRedis.getClient().keys).toHaveBeenCalledWith(
      `ai:progress_summary:${TENANT_ID}:${STUDENT_ID}:*`,
    );
    expect(mockRedis.getClient().del).toHaveBeenCalledWith(...keys);
  });

  it('should not call del when no keys found during wildcard scan', async () => {
    mockRedis.getClient().keys.mockResolvedValue([]);

    await service.invalidateCache(TENANT_ID, STUDENT_ID);

    expect(mockRedis.getClient().del).not.toHaveBeenCalled();
  });

  it('should silently swallow Redis errors without throwing', async () => {
    mockRedis.getClient().del.mockRejectedValue(new Error('Redis connection lost'));

    // Should not throw
    await expect(service.invalidateCache(TENANT_ID, STUDENT_ID, PERIOD_ID)).resolves.toBeUndefined();
  });
});
