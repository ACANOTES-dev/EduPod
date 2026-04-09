import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

import { ReportCardAiDraftService } from './report-card-ai-draft.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_TEACHER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';

function buildMockPrisma() {
  return {
    periodGradeSnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const mockStudentFacade = {
  findById: jest.fn(),
};
const mockAcademicFacade = {
  findSubjectById: jest.fn(),
  findPeriodById: jest.fn(),
};
const mockClassesFacade = {
  findById: jest.fn(),
  findClassStaffGeneric: jest.fn(),
};

const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue({ ai: { commentsEnabled: true } }),
};

const mockConsentService = {
  hasConsent: jest.fn().mockResolvedValue(true),
};

const mockGdprTokenService = {
  processOutbound: jest.fn().mockResolvedValue({
    processedData: { entities: [{ fields: { full_name: 'TOKEN-1' } }], entityCount: 1 },
    tokenMap: {},
  }),
  processInbound: jest.fn().mockImplementation(async (_tenantId: string, text: string) => text),
};

const mockAiAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockAnthropicClient = {
  isConfigured: true,
  createMessage: jest.fn(),
};

const mockWindowsService = {
  assertWindowOpenForPeriod: jest.fn(),
};

describe('ReportCardAiDraftService', () => {
  let service: ReportCardAiDraftService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAnthropicClient.createMessage.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'A focused and capable mathematician this term.' }],
      usage: { input_tokens: 200, output_tokens: 40 },
    });
    mockSettingsService.getSettings
      .mockReset()
      .mockResolvedValue({ ai: { commentsEnabled: true } });
    mockWindowsService.assertWindowOpenForPeriod.mockReset().mockResolvedValue(undefined);
    mockConsentService.hasConsent.mockReset().mockResolvedValue(true);
    mockGdprTokenService.processOutbound.mockReset().mockResolvedValue({
      processedData: { entities: [{ fields: { full_name: 'TOKEN-1' } }], entityCount: 1 },
      tokenMap: {},
    });
    mockGdprTokenService.processInbound
      .mockReset()
      .mockImplementation(async (_t: string, text: string) => text);
    mockAiAuditService.log.mockReset().mockResolvedValue(undefined);
    (mockAnthropicClient as { isConfigured: boolean }).isConfigured = true;

    mockStudentFacade.findById.mockReset();
    mockAcademicFacade.findSubjectById.mockReset();
    mockAcademicFacade.findPeriodById.mockReset();
    mockClassesFacade.findById.mockReset();
    mockClassesFacade.findClassStaffGeneric.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardAiDraftService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: mockAiAuditService },
        { provide: AnthropicClientService, useValue: mockAnthropicClient },
        { provide: ReportCommentWindowsService, useValue: mockWindowsService },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
      ],
    }).compile();

    service = module.get<ReportCardAiDraftService>(ReportCardAiDraftService);

    // Default happy-path facade responses
    mockClassesFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
    mockStudentFacade.findById.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Alex',
      last_name: 'Student',
    });
    mockAcademicFacade.findSubjectById.mockResolvedValue({ id: SUBJECT_ID, name: 'Mathematics' });
    mockAcademicFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID, name: 'Term 1' });
    mockPrisma.periodGradeSnapshot.findFirst.mockResolvedValue({
      computed_value: 85,
      display_value: 'B',
      overridden_value: null,
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      { computed_value: 80, display_value: 'C', snapshot_at: new Date('2025-10-01T00:00:00Z') },
      { computed_value: 85, display_value: 'B', snapshot_at: new Date('2025-12-01T00:00:00Z') },
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  const args = {
    studentId: STUDENT_ID,
    subjectId: SUBJECT_ID,
    classId: CLASS_ID,
    academicPeriodId: PERIOD_ID,
  };

  it('should return a non-empty draft comment for the happy path', async () => {
    const result = await service.draftSubjectComment(
      TENANT_ID,
      { userId: TEACHER_ID, isAdmin: false },
      args,
    );
    expect(result.comment_text.length).toBeGreaterThan(0);
    expect(result.model).toContain('claude');
    expect(result.tokens_used).toBe(240);
    expect(mockAiAuditService.log).toHaveBeenCalled();
  });

  it('should throw AI_SERVICE_UNAVAILABLE when Anthropic key is not configured', async () => {
    (mockAnthropicClient as { isConfigured: boolean }).isConfigured = false;
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw AI_FEATURE_DISABLED when tenant has not opted in', async () => {
    mockSettingsService.getSettings.mockResolvedValue({ ai: { commentsEnabled: false } });
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args),
    ).rejects.toMatchObject({ response: { code: 'AI_FEATURE_DISABLED' } });
  });

  it('should reject when actor does not teach the class', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([]);
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: OTHER_TEACHER_ID, isAdmin: false }, args),
    ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
    // Window check should not run when authorship fails
    expect(mockWindowsService.assertWindowOpenForPeriod).not.toHaveBeenCalled();
  });

  it('should reject when the comment window is closed', async () => {
    mockWindowsService.assertWindowOpenForPeriod.mockRejectedValue(
      new ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: 'closed' }),
    );
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
    expect(mockAnthropicClient.createMessage).not.toHaveBeenCalled();
  });

  it('should 404 when the student does not exist', async () => {
    mockStudentFacade.findById.mockResolvedValue(null);
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject when AI consent is not granted', async () => {
    mockConsentService.hasConsent.mockResolvedValue(false);
    await expect(
      service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args),
    ).rejects.toMatchObject({ response: { code: 'CONSENT_REQUIRED' } });
  });

  it('should allow an admin to bypass the authorship check', async () => {
    mockClassesFacade.findClassStaffGeneric.mockResolvedValue([]);
    const result = await service.draftSubjectComment(
      TENANT_ID,
      { userId: OTHER_TEACHER_ID, isAdmin: true },
      args,
    );
    expect(result.comment_text.length).toBeGreaterThan(0);
  });

  it('should call the window enforcement service with the right period', async () => {
    await service.draftSubjectComment(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, args);
    expect(mockWindowsService.assertWindowOpenForPeriod).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID);
  });
});
