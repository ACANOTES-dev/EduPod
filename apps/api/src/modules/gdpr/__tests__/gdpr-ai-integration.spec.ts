/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { AiCommentsService } from '../../gradebook/ai/ai-comments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiSubstitutionService } from '../../scheduling/ai-substitution.service';
import { GdprTokenService } from '../gdpr-token.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const SCHEDULE_ID = '33333333-3333-3333-3333-333333333333';
const ACADEMIC_YEAR_ID = '44444444-4444-4444-4444-444444444444';
const STAFF_A_ID = '55555555-5555-5555-5555-555555555555';
const STAFF_B_ID = '66666666-6666-6666-6666-666666666666';

// ─── Shared mock setup ───────────────────────────────────────────────────────

const makeAiSettings = (overrides: Record<string, unknown> = {}) => ({
  ai: {
    enabled: true,
    commentsEnabled: true,
    substitutionRankingEnabled: true,
    gradingEnabled: false,
    progressSummariesEnabled: false,
    nlQueriesEnabled: false,
    reportNarrationEnabled: false,
    predictionsEnabled: false,
    attendanceScanEnabled: false,
    commentStyle: 'balanced',
    commentTargetWordCount: 100,
    ...overrides,
  },
});

// ─── AI Comments GDPR Integration ────────────────────────────────────────────

describe('AI Comments GDPR Integration', () => {
  let commentsService: AiCommentsService;
  let mockGdprTokenService: {
    processOutbound: jest.Mock;
    processInbound: jest.Mock;
  };
  let mockAiAuditService: { log: jest.Mock };
  let mockConsentService: { hasConsent: jest.Mock };
  let mockSettingsService: { getSettings: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockGdprTokenService = {
      processOutbound: jest.fn(),
      processInbound: jest.fn(),
    };

    mockSettingsService = {
      getSettings: jest.fn(),
    };

    mockAiAuditService = {
      log: jest.fn().mockResolvedValue('ai-log-id'),
    };

    mockConsentService = {
      hasConsent: jest.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      reportCard: { findFirst: jest.fn() },
      periodGradeSnapshot: { findMany: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
    };

    // Set ANTHROPIC_API_KEY so the service attempts to initialise the SDK
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Mock the Anthropic SDK require
    jest.mock('@anthropic-ai/sdk', () => ({
      default: class MockAnthropic {
        messages = {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: 'TOKENISED_STUDENT is performing very well this term.',
              },
            ],
          }),
        };
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: mockAiAuditService },
      ],
    }).compile();

    commentsService = module.get<AiCommentsService>(AiCommentsService);
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    jest.restoreAllMocks();
  });

  it('should call processOutbound before AI call with student entity', async () => {
    mockSettingsService.getSettings.mockResolvedValue(makeAiSettings());

    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      academic_period_id: 'period-1',
      template_locale: 'en',
      student: {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      },
      academic_period: { id: 'period-1', name: 'Term 1' },
    });

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        overridden_value: null,
        computed_value: 85,
        display_value: 'A',
        subject: { name: 'Mathematics' },
      },
    ]);

    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      { status: 'present' },
      { status: 'present' },
      { status: 'absent_excused' },
    ]);

    // processOutbound returns tokenised data
    mockGdprTokenService.processOutbound.mockResolvedValue({
      processedData: {
        entities: [
          {
            type: 'student',
            id: STUDENT_ID,
            fields: { full_name: 'TOKENISED_STUDENT' },
          },
        ],
        entityCount: 1,
      },
      tokenMap: { TOKENISED_STUDENT: 'Alice Smith' },
    });

    mockGdprTokenService.processInbound.mockResolvedValue(
      'Alice Smith is performing very well this term.',
    );

    const result = await commentsService.generateComment(TENANT_ID, REPORT_CARD_ID);

    // Verify processOutbound was called with correct shape
    expect(mockGdprTokenService.processOutbound).toHaveBeenCalledTimes(1);
    const [tenantId, exportType, outboundData, triggeredBy] =
      mockGdprTokenService.processOutbound.mock.calls[0];

    expect(tenantId).toBe(TENANT_ID);
    expect(exportType).toBe('ai_comments');
    expect(outboundData.entities).toHaveLength(1);
    expect(outboundData.entities[0].type).toBe('student');
    expect(outboundData.entities[0].id).toBe(STUDENT_ID);
    expect(typeof outboundData.entities[0].fields.full_name).toBe('string');
    expect(outboundData.entityCount).toBe(1);
    expect(triggeredBy).toBe(SYSTEM_USER_SENTINEL);

    // Verify the result was detokenised
    expect(result.comment).toBe('Alice Smith is performing very well this term.');
  });

  it('should call processInbound to detokenise AI response', async () => {
    mockSettingsService.getSettings.mockResolvedValue(makeAiSettings());

    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      academic_period_id: 'period-1',
      template_locale: 'en',
      student: {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      },
      academic_period: { id: 'period-1', name: 'Term 1' },
    });

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    const tokenMap = { ABCDEFGHJKLMNP: 'Alice Smith' };

    mockGdprTokenService.processOutbound.mockResolvedValue({
      processedData: {
        entities: [
          {
            type: 'student',
            id: STUDENT_ID,
            fields: { full_name: 'ABCDEFGHJKLMNP' },
          },
        ],
        entityCount: 1,
      },
      tokenMap,
    });

    mockGdprTokenService.processInbound.mockResolvedValue('Alice Smith shows excellent progress.');

    await commentsService.generateComment(TENANT_ID, REPORT_CARD_ID);

    // Verify processInbound was called with the AI response and tokenMap
    expect(mockGdprTokenService.processInbound).toHaveBeenCalledTimes(1);
    const [inboundTenantId, responseText, passedTokenMap] =
      mockGdprTokenService.processInbound.mock.calls[0];

    expect(inboundTenantId).toBe(TENANT_ID);
    expect(typeof responseText).toBe('string');
    expect(passedTokenMap).toBe(tokenMap);
  });

  it('should not call GDPR gateway when AI service is unavailable', async () => {
    // Create a service instance without the API key
    delete process.env.ANTHROPIC_API_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: mockAiAuditService },
      ],
    }).compile();

    const serviceWithoutKey = module.get<AiCommentsService>(AiCommentsService);

    await expect(serviceWithoutKey.generateComment(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(mockGdprTokenService.processOutbound).not.toHaveBeenCalled();
  });
});

// ─── AI Substitution GDPR Integration ────────────────────────────────────────

describe('AI Substitution GDPR Integration', () => {
  let substitutionService: AiSubstitutionService;
  let mockGdprTokenService: {
    processOutbound: jest.Mock;
    processInbound: jest.Mock;
  };
  let mockAiAuditService: { log: jest.Mock };
  let mockSettingsService: { getSettings: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockGdprTokenService = {
      processOutbound: jest.fn(),
      processInbound: jest.fn(),
    };

    mockSettingsService = {
      getSettings: jest.fn(),
    };

    mockAiAuditService = {
      log: jest.fn().mockResolvedValue('ai-log-id'),
    };

    mockPrisma = {
      schedule: { findFirst: jest.fn(), findMany: jest.fn() },
      staffProfile: { findMany: jest.fn() },
      teacherCompetency: { findMany: jest.fn() },
      substitutionRecord: { findMany: jest.fn() },
    };

    process.env.ANTHROPIC_API_KEY = 'test-key';

    jest.mock('@anthropic-ai/sdk', () => ({
      default: class MockAnthropic {
        messages = {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  {
                    staff_profile_id: STAFF_A_ID,
                    confidence: 'high',
                    score: 90,
                    reasoning: 'Primary subject teacher.',
                  },
                  {
                    staff_profile_id: STAFF_B_ID,
                    confidence: 'medium',
                    score: 70,
                    reasoning: 'Competent but higher cover load.',
                  },
                ]),
              },
            ],
          }),
        };
      },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSubstitutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: mockAiAuditService },
      ],
    }).compile();

    substitutionService = module.get<AiSubstitutionService>(AiSubstitutionService);
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    jest.restoreAllMocks();
  });

  it('should tokenise all staff names before sending to AI', async () => {
    mockSettingsService.getSettings.mockResolvedValue(makeAiSettings());

    // Schedule context
    mockPrisma.schedule.findFirst.mockResolvedValue({
      id: SCHEDULE_ID,
      tenant_id: TENANT_ID,
      teacher_staff_id: 'absent-teacher-id',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      academic_year_id: ACADEMIC_YEAR_ID,
      class_entity: {
        name: 'Class 5A',
        year_group_id: 'yg-1',
        subject_id: 'subj-1',
        academic_year_id: ACADEMIC_YEAR_ID,
        subject: { name: 'Mathematics' },
        year_group: { name: 'Year 5' },
      },
      room: { name: 'Room 101' },
    });

    // No other teachers busy at the same time
    mockPrisma.schedule.findMany.mockResolvedValue([]);

    // Available staff
    mockPrisma.staffProfile.findMany.mockResolvedValue([
      {
        id: STAFF_A_ID,
        user: { first_name: 'John', last_name: 'Doe' },
      },
      {
        id: STAFF_B_ID,
        user: { first_name: 'Jane', last_name: 'Roe' },
      },
    ]);

    mockPrisma.teacherCompetency.findMany.mockResolvedValue([
      {
        staff_profile_id: STAFF_A_ID,
        is_primary: true,
      },
    ]);

    mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

    // processOutbound tokenises staff names
    mockGdprTokenService.processOutbound.mockResolvedValue({
      processedData: {
        entities: [
          {
            type: 'staff',
            id: STAFF_A_ID,
            fields: { full_name: 'TOKEN_JOHN' },
          },
          {
            type: 'staff',
            id: STAFF_B_ID,
            fields: { full_name: 'TOKEN_JANE' },
          },
        ],
        entityCount: 2,
      },
      tokenMap: { TOKEN_JOHN: 'John Doe', TOKEN_JANE: 'Jane Roe' },
    });

    // processInbound returns the detokenised JSON string
    const aiResponseJson = JSON.stringify([
      {
        staff_profile_id: STAFF_A_ID,
        confidence: 'high',
        score: 90,
        reasoning: 'Primary subject teacher.',
      },
      {
        staff_profile_id: STAFF_B_ID,
        confidence: 'medium',
        score: 70,
        reasoning: 'Competent but higher cover load.',
      },
    ]);
    mockGdprTokenService.processInbound.mockResolvedValue(aiResponseJson);

    await substitutionService.rankSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-30');

    // Verify processOutbound was called with staff entities
    expect(mockGdprTokenService.processOutbound).toHaveBeenCalledTimes(1);
    const [tenantId, exportType, outboundData, triggeredBy] =
      mockGdprTokenService.processOutbound.mock.calls[0];

    expect(tenantId).toBe(TENANT_ID);
    expect(exportType).toBe('ai_substitution');
    expect(triggeredBy).toBe(SYSTEM_USER_SENTINEL);

    // Verify entities contain staff members
    expect(outboundData.entities.length).toBe(2);
    for (const entity of outboundData.entities) {
      expect(entity.type).toBe('staff');
      expect(typeof entity.fields.full_name).toBe('string');
    }

    // Verify staff IDs match available staff
    const entityIds = outboundData.entities.map((e: { id: string }) => e.id);
    expect(entityIds).toContain(STAFF_A_ID);
    expect(entityIds).toContain(STAFF_B_ID);
  });

  it('should detokenise AI response before parsing rankings', async () => {
    mockSettingsService.getSettings.mockResolvedValue(makeAiSettings());

    mockPrisma.schedule.findFirst.mockResolvedValue({
      id: SCHEDULE_ID,
      tenant_id: TENANT_ID,
      teacher_staff_id: 'absent-teacher-id',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      academic_year_id: ACADEMIC_YEAR_ID,
      class_entity: {
        name: 'Class 5A',
        year_group_id: 'yg-1',
        subject_id: 'subj-1',
        academic_year_id: ACADEMIC_YEAR_ID,
        subject: { name: 'Mathematics' },
        year_group: { name: 'Year 5' },
      },
      room: { name: 'Room 101' },
    });

    mockPrisma.schedule.findMany.mockResolvedValue([]);

    mockPrisma.staffProfile.findMany.mockResolvedValue([
      {
        id: STAFF_A_ID,
        user: { first_name: 'John', last_name: 'Doe' },
      },
    ]);

    mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
    mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

    const tokenMap = { TOKEN_JOHN: 'John Doe' };

    mockGdprTokenService.processOutbound.mockResolvedValue({
      processedData: {
        entities: [
          {
            type: 'staff',
            id: STAFF_A_ID,
            fields: { full_name: 'TOKEN_JOHN' },
          },
        ],
        entityCount: 1,
      },
      tokenMap,
    });

    const detokenisedResponse = JSON.stringify([
      {
        staff_profile_id: STAFF_A_ID,
        confidence: 'high',
        score: 95,
        reasoning: 'Best match for the subject.',
      },
    ]);
    mockGdprTokenService.processInbound.mockResolvedValue(detokenisedResponse);

    await substitutionService.rankSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-30');

    // Verify processInbound was called with the AI response text and tokenMap
    expect(mockGdprTokenService.processInbound).toHaveBeenCalledTimes(1);
    const [inboundTenantId, responseText, passedTokenMap] =
      mockGdprTokenService.processInbound.mock.calls[0];

    expect(inboundTenantId).toBe(TENANT_ID);
    expect(typeof responseText).toBe('string');
    expect(passedTokenMap).toBe(tokenMap);
  });

  it('should not call GDPR gateway when no available staff exist', async () => {
    mockSettingsService.getSettings.mockResolvedValue(makeAiSettings());

    mockPrisma.schedule.findFirst.mockResolvedValue({
      id: SCHEDULE_ID,
      tenant_id: TENANT_ID,
      teacher_staff_id: STAFF_A_ID,
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      academic_year_id: ACADEMIC_YEAR_ID,
      class_entity: {
        name: 'Class 5A',
        year_group_id: null,
        subject_id: null,
        academic_year_id: ACADEMIC_YEAR_ID,
        subject: null,
        year_group: null,
      },
      room: null,
    });

    mockPrisma.schedule.findMany.mockResolvedValue([]);

    // Only the absent teacher exists, so no one is available
    mockPrisma.staffProfile.findMany.mockResolvedValue([
      {
        id: STAFF_A_ID,
        user: { first_name: 'John', last_name: 'Doe' },
      },
    ]);

    const result = await substitutionService.rankSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-30');

    expect(result.data).toEqual([]);
    expect(mockGdprTokenService.processOutbound).not.toHaveBeenCalled();
  });
});
