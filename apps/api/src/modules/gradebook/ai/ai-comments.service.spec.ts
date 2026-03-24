import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../../configuration/settings.service';
import { PrismaService } from '../../prisma/prisma.service';

import { AiCommentsService } from './ai-comments.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'rc-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCard: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
  };
}

function buildMockSettingsService(aiOverrides: Record<string, unknown> = {}) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      ai: { commentStyle: 'balanced', commentTargetWordCount: 100, ...aiOverrides },
    }),
  };
}

function buildMockAnthropic(responseText = 'Great student progress this term.') {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  };
}

const baseReportCard = {
  id: REPORT_CARD_ID,
  tenant_id: TENANT_ID,
  student_id: 'student-1',
  academic_period_id: 'period-1',
  template_locale: 'en',
  student: { id: 'student-1', first_name: 'John', last_name: 'Doe' },
  academic_period: { id: 'period-1', name: 'Term 1' },
};

const baseSnapshots = [
  {
    subject: { name: 'Math' },
    computed_value: 85,
    overridden_value: null,
    display_value: 'B',
  },
];

const baseAttendance = [
  { status: 'present' },
  { status: 'present' },
  { status: 'absent_excused' },
  { status: 'late' },
];

// ─── generateComment Tests ────────────────────────────────────────────────────

describe('AiCommentsService — generateComment', () => {
  let service: AiCommentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockSettings = buildMockSettingsService();

    mockPrisma.reportCard.findFirst.mockResolvedValue(baseReportCard);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(baseSnapshots);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue(baseAttendance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get<AiCommentsService>(AiCommentsService);

    // Inject mock anthropic client
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic client is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

    await expect(
      service.generateComment(TENANT_ID, REPORT_CARD_ID),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(
      service.generateComment(TENANT_ID, REPORT_CARD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return comment result with correct report_card_id and locale', async () => {
    const result = await service.generateComment(TENANT_ID, REPORT_CARD_ID);

    expect(result.report_card_id).toBe(REPORT_CARD_ID);
    expect(result.locale).toBe('en');
    expect(typeof result.comment).toBe('string');
    expect(result.comment.length).toBeGreaterThan(0);
  });

  it('should return Arabic locale when template_locale is ar', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      template_locale: 'ar',
    });

    const result = await service.generateComment(TENANT_ID, REPORT_CARD_ID);

    expect(result.locale).toBe('ar');
  });

  it('should call AI with settings-derived comment style', async () => {
    mockSettings.getSettings.mockResolvedValue({
      ai: { commentStyle: 'formal', commentTargetWordCount: 150 },
    });

    await service.generateComment(TENANT_ID, REPORT_CARD_ID);

    const mockAnthropicCreate = (
      (service as unknown as Record<string, unknown>).anthropic as ReturnType<typeof buildMockAnthropic>
    ).messages.create;

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
    );
  });

  it('should return empty string comment when AI returns no text block', async () => {
    (service as unknown as Record<string, unknown>).anthropic = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'image' }],
        }),
      },
    };

    const result = await service.generateComment(TENANT_ID, REPORT_CARD_ID);

    expect(result.comment).toBe('');
  });

  it('should include sample reference in prompt when commentSampleReference is set', async () => {
    mockSettings.getSettings.mockResolvedValue({
      ai: {
        commentStyle: 'warm',
        commentSampleReference: 'This student consistently shows dedication.',
        commentTargetWordCount: 80,
      },
    });

    await service.generateComment(TENANT_ID, REPORT_CARD_ID);

    const mockCreate = (
      (service as unknown as Record<string, unknown>).anthropic as ReturnType<typeof buildMockAnthropic>
    ).messages.create;

    const prompt = (mockCreate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    const messages = prompt.messages as Array<{ content: string }>;
    expect(messages[0]?.content).toContain('sample');
  });
});

// ─── generateBatchComments Tests ──────────────────────────────────────────────

describe('AiCommentsService — generateBatchComments', () => {
  let service: AiCommentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockSettings: ReturnType<typeof buildMockSettingsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockSettings = buildMockSettingsService();

    mockPrisma.reportCard.findFirst.mockResolvedValue(baseReportCard);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(baseSnapshots);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue(baseAttendance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get<AiCommentsService>(AiCommentsService);
    (service as unknown as Record<string, unknown>).anthropic = buildMockAnthropic();
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when anthropic is not configured', async () => {
    (service as unknown as Record<string, unknown>).anthropic = null;

    await expect(
      service.generateBatchComments(TENANT_ID, ['rc-1', 'rc-2']),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should return results and empty errors on full success', async () => {
    const result = await service.generateBatchComments(TENANT_ID, ['rc-1', 'rc-2']);

    expect(result.results).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('should capture error for a failing report card without aborting others', async () => {
    mockPrisma.reportCard.findFirst
      .mockResolvedValueOnce(baseReportCard)    // rc-1 succeeds
      .mockResolvedValueOnce(null);            // rc-2 throws NotFoundException

    const result = await service.generateBatchComments(TENANT_ID, ['rc-1', 'rc-2']);

    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.report_card_id).toBe('rc-2');
  });

  it('edge: empty input returns empty results and errors', async () => {
    const result = await service.generateBatchComments(TENANT_ID, []);

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
