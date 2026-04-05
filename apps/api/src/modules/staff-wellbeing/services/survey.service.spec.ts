/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SURVEY_ID_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const QUESTION_ID_1 = '11111111-1111-1111-1111-111111111111';
const QUESTION_ID_2 = '22222222-2222-2222-2222-222222222222';
const QUESTION_ID_3 = '33333333-3333-3333-3333-333333333333';
const RESPONSE_ID_1 = 'aaaa1111-1111-1111-1111-111111111111';
const RESPONSE_ID_2 = 'aaaa2222-2222-2222-2222-222222222222';
const RESPONSE_ID_3 = 'aaaa3333-3333-3333-3333-333333333333';
const TOKEN_HASH = 'a'.repeat(64);
const STAFF_PROFILE_ID = 'ff000000-0000-0000-0000-000000000001';

// ─── Helpers ────────────────────────────────────────────────────────────────

const futureDate = (daysFromNow: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
};

const pastDate = (daysAgo: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
};

const makeQuestion = (
  overrides: Partial<{
    id: string;
    question_type: string;
    display_order: number;
    question_text: string;
    options: unknown;
    is_required: boolean;
  }> = {},
) => ({
  id: overrides.id ?? QUESTION_ID_1,
  tenant_id: TENANT_ID,
  survey_id: SURVEY_ID,
  question_text: overrides.question_text ?? 'How are you?',
  question_type: overrides.question_type ?? 'likert_5',
  display_order: overrides.display_order ?? 0,
  options: overrides.options ?? null,
  is_required: overrides.is_required ?? true,
  created_at: new Date(),
});

const makeSurvey = (
  overrides: Partial<{
    id: string;
    status: string;
    window_opens_at: Date;
    window_closes_at: Date;
    moderation_enabled: boolean;
    questions: ReturnType<typeof makeQuestion>[];
    created_by: string;
  }> = {},
) => ({
  id: overrides.id ?? SURVEY_ID,
  tenant_id: TENANT_ID,
  title: 'Staff Wellbeing Check',
  description: 'Weekly check-in',
  status: overrides.status ?? 'draft',
  frequency: 'fortnightly',
  window_opens_at: overrides.window_opens_at ?? futureDate(1),
  window_closes_at: overrides.window_closes_at ?? futureDate(8),
  results_released: false,
  min_response_threshold: 5,
  dept_drill_down_threshold: 10,
  moderation_enabled: overrides.moderation_enabled ?? true,
  created_by: overrides.created_by ?? USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
  questions: overrides.questions ?? [makeQuestion()],
});

const makeCreateDto = (
  overrides: Partial<{
    window_opens_at: string;
    window_closes_at: string;
    min_response_threshold: number;
    dept_drill_down_threshold: number;
  }> = {},
) => ({
  title: 'Staff Wellbeing Check',
  description: 'Weekly check-in',
  frequency: 'fortnightly' as const,
  window_opens_at: overrides.window_opens_at ?? futureDate(1).toISOString(),
  window_closes_at: overrides.window_closes_at ?? futureDate(8).toISOString(),
  min_response_threshold: overrides.min_response_threshold ?? 5,
  dept_drill_down_threshold: overrides.dept_drill_down_threshold ?? 10,
  moderation_enabled: true,
  questions: [
    {
      question_text: 'How are you?',
      question_type: 'likert_5' as const,
      display_order: 0,
      is_required: true,
    },
  ],
});

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffSurvey: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  surveyQuestion: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  surveyResponse: {
    create: jest.fn(),
    count: jest.fn(),
  },
  surveyParticipationToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  staffProfile: {
    count: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test Suite ─────────────────────────────────────────────────────────────

import { HmacService } from './hmac.service';
import { SurveyService } from './survey.service';

describe('SurveyService', () => {
  let service: SurveyService;
  let mockHmacService: { computeTokenHash: jest.Mock; getOrCreateHmacSecret: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockHmacService = {
      computeTokenHash: jest.fn().mockResolvedValue(TOKEN_HASH),
      getOrCreateHmacSecret: jest.fn().mockResolvedValue('secret'),
    };
    mockQueue = { add: jest.fn().mockResolvedValue({}) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const method of Object.values(model)) {
        method.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        { provide: PrismaService, useValue: {} },
        { provide: HmacService, useValue: mockHmacService },
        { provide: getQueueToken('wellbeing'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SurveyService>(SurveyService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── B1: CREATE ───────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create survey with draft status and questions', async () => {
      const dto = makeCreateDto();
      const createdSurvey = makeSurvey();

      mockRlsTx.staffSurvey.create.mockResolvedValue(createdSurvey);
      mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(createdSurvey);

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.status).toBe('draft');
      expect(result.results_released).toBe(false);
      expect(result.created_by).toBe(USER_ID);
      expect(mockRlsTx.staffSurvey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'draft',
          results_released: false,
          created_by: USER_ID,
        }),
      });
      expect(mockRlsTx.surveyQuestion.createMany).toHaveBeenCalled();
    });

    it('should reject when window_closes_at is before window_opens_at', async () => {
      const dto = makeCreateDto({
        window_opens_at: futureDate(8).toISOString(),
        window_closes_at: futureDate(1).toISOString(),
      });

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'INVALID_WINDOW_DATES' }),
          }),
        }),
      );
    });

    it('should reject when window_closes_at equals window_opens_at', async () => {
      const sameDate = futureDate(5).toISOString();
      const dto = makeCreateDto({
        window_opens_at: sameDate,
        window_closes_at: sameDate,
      });

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'INVALID_WINDOW_DATES' }),
          }),
        }),
      );
    });
  });

  // ─── B1: FIND ALL ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated surveys with response count', async () => {
      const surveys = [
        { ...makeSurvey(), _count: { responses: 10 } },
        { ...makeSurvey({ id: SURVEY_ID_B }), _count: { responses: 0 } },
      ];
      mockRlsTx.staffSurvey.findMany.mockResolvedValue(surveys);
      mockRlsTx.staffSurvey.count.mockResolvedValue(2);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('should use default pagination when no query params', async () => {
      mockRlsTx.staffSurvey.findMany.mockResolvedValue([]);
      mockRlsTx.staffSurvey.count.mockResolvedValue(0);

      const result = await service.findAll(TENANT_ID, {});

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });
  });

  // ─── B1: FIND ONE ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return survey with questions and response_count for active survey', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.count.mockResolvedValue(15);
      mockRlsTx.staffProfile.count.mockResolvedValue(50);

      const result = await service.findOne(TENANT_ID, SURVEY_ID);

      expect(result.response_count).toBe(15);
      expect(result.eligible_staff_count).toBe(50);
      expect(result.response_rate).toBeUndefined();
    });

    it('should return response_rate for closed survey', async () => {
      const survey = makeSurvey({ status: 'closed' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.count.mockResolvedValue(20);
      mockRlsTx.staffProfile.count.mockResolvedValue(50);

      const result = await service.findOne(TENANT_ID, SURVEY_ID);

      expect(result.response_count).toBe(20);
      expect(result.response_rate).toBe(0.4);
    });

    it('should return response_rate for archived survey', async () => {
      const survey = makeSurvey({ status: 'archived' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.count.mockResolvedValue(10);
      mockRlsTx.staffProfile.count.mockResolvedValue(25);

      const result = await service.findOne(TENANT_ID, SURVEY_ID);

      expect(result.response_rate).toBe(0.4);
    });

    it('should handle zero eligible staff (no division by zero)', async () => {
      const survey = makeSurvey({ status: 'closed' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.count.mockResolvedValue(0);
      mockRlsTx.staffProfile.count.mockResolvedValue(0);

      const result = await service.findOne(TENANT_ID, SURVEY_ID);

      expect(result.response_rate).toBe(0);
    });

    it('should throw SURVEY_NOT_FOUND if survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });
  });

  // ─── B1: UPDATE ───────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update draft survey and replace questions', async () => {
      const existing = makeSurvey({ status: 'draft' });
      const updated = { ...existing, title: 'Updated Title' };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.update.mockResolvedValue(updated);
      mockRlsTx.surveyQuestion.deleteMany.mockResolvedValue({ count: 1 });
      mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 2 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue({
        ...updated,
        questions: [makeQuestion(), makeQuestion({ id: QUESTION_ID_2, display_order: 1 })],
      });

      const result = await service.update(TENANT_ID, SURVEY_ID, {
        title: 'Updated Title',
        questions: [
          { question_text: 'Q1', question_type: 'likert_5', display_order: 0, is_required: true },
          { question_text: 'Q2', question_type: 'freeform', display_order: 1, is_required: false },
        ],
      });

      expect(mockRlsTx.surveyQuestion.deleteMany).toHaveBeenCalledWith({
        where: { survey_id: SURVEY_ID },
      });
      expect(mockRlsTx.surveyQuestion.createMany).toHaveBeenCalled();
      expect(result.questions).toHaveLength(2);
    });

    it('should throw 409 when updating non-draft survey', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(makeSurvey({ status: 'active' }));

      await expect(service.update(TENANT_ID, SURVEY_ID, { title: 'New Title' })).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_DRAFT' }),
          }),
        }),
      );
    });

    it('should throw SURVEY_NOT_FOUND if survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, SURVEY_ID, { title: 'New' })).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });
  });

  // ─── B2: CLONE ────────────────────────────────────────────────────────────

  describe('clone', () => {
    it('should create new draft with same questions, blank dates, current user', async () => {
      const source = makeSurvey({
        status: 'closed',
        questions: [
          makeQuestion({ id: QUESTION_ID_1, question_text: 'Q1', display_order: 0 }),
          makeQuestion({ id: QUESTION_ID_2, question_text: 'Q2', display_order: 1 }),
        ],
      });
      const newSurvey = {
        ...source,
        id: SURVEY_ID_B,
        status: 'draft',
        title: 'Staff Wellbeing Check (Copy)',
        created_by: OTHER_USER_ID,
        window_opens_at: new Date(0),
        window_closes_at: new Date(0),
      };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(source);
      mockRlsTx.staffSurvey.create.mockResolvedValue(newSurvey);
      mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 2 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue({
        ...newSurvey,
        questions: source.questions.map((q) => ({ ...q, survey_id: SURVEY_ID_B })),
      });

      const result = await service.clone(TENANT_ID, SURVEY_ID, OTHER_USER_ID);

      expect(result.status).toBe('draft');
      expect(result.created_by).toBe(OTHER_USER_ID);
      expect(result.title).toBe('Staff Wellbeing Check (Copy)');
      expect(result.questions).toHaveLength(2);
      // Verify blank window dates
      expect(mockRlsTx.staffSurvey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          window_opens_at: new Date(0),
          window_closes_at: new Date(0),
          status: 'draft',
          created_by: OTHER_USER_ID,
        }),
      });
    });

    it('should clone survey from any status', async () => {
      for (const status of ['draft', 'active', 'closed', 'archived']) {
        // Reset mocks for each iteration
        for (const model of Object.values(mockRlsTx)) {
          for (const method of Object.values(model)) {
            method.mockReset();
          }
        }

        const source = makeSurvey({ status });
        const cloned = { ...source, id: SURVEY_ID_B, status: 'draft', created_by: USER_ID };

        mockRlsTx.staffSurvey.findFirst.mockResolvedValue(source);
        mockRlsTx.staffSurvey.create.mockResolvedValue(cloned);
        mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
        mockRlsTx.staffSurvey.findUnique.mockResolvedValue({
          ...cloned,
          questions: source.questions,
        });

        const result = await service.clone(TENANT_ID, SURVEY_ID, USER_ID);
        expect(result.status).toBe('draft');
      }
    });

    it('should throw SURVEY_NOT_FOUND if source does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(service.clone(TENANT_ID, SURVEY_ID, USER_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });

    it('should copy threshold settings from source', async () => {
      const source = makeSurvey({
        status: 'closed',
        questions: [makeQuestion()],
      });
      // Customize thresholds on source for verification
      (source as Record<string, unknown>).min_response_threshold = 7;
      (source as Record<string, unknown>).dept_drill_down_threshold = 15;

      const cloned = { ...source, id: SURVEY_ID_B, status: 'draft', created_by: USER_ID };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(source);
      mockRlsTx.staffSurvey.create.mockResolvedValue(cloned);
      mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue({
        ...cloned,
        questions: source.questions,
      });

      await service.clone(TENANT_ID, SURVEY_ID, USER_ID);

      expect(mockRlsTx.staffSurvey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          min_response_threshold: 7,
          dept_drill_down_threshold: 15,
        }),
      });
    });
  });

  // ─── B3: ACTIVATE ─────────────────────────────────────────────────────────

  describe('activate', () => {
    it('should activate draft survey with no other active survey', async () => {
      const survey = makeSurvey({
        status: 'draft',
        questions: [makeQuestion()],
      });
      const activated = { ...survey, status: 'active' };

      mockRlsTx.staffSurvey.findFirst
        .mockResolvedValueOnce(survey) // find the survey
        .mockResolvedValueOnce(null); // no other active
      mockRlsTx.staffSurvey.update.mockResolvedValue(activated);

      const result = await service.activate(TENANT_ID, SURVEY_ID);

      expect(result.status).toBe('active');
      expect(mockQueue.add).toHaveBeenCalledWith('wellbeing:survey-open-notify', {
        tenant_id: TENANT_ID,
        survey_id: SURVEY_ID,
      });
    });

    it('should throw 409 SURVEY_ALREADY_ACTIVE when another survey is active', async () => {
      const survey = makeSurvey({
        status: 'draft',
        questions: [makeQuestion()],
      });
      const otherActive = makeSurvey({ id: SURVEY_ID_B, status: 'active' });

      mockRlsTx.staffSurvey.findFirst
        .mockResolvedValueOnce(survey) // find the survey
        .mockResolvedValueOnce(otherActive); // another active exists

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_ALREADY_ACTIVE' }),
          }),
        }),
      );

      // Should NOT enqueue notification
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should throw when survey has no questions', async () => {
      const survey = makeSurvey({ status: 'draft', questions: [] });

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'NO_QUESTIONS' }),
          }),
        }),
      );
    });

    it('should throw when activating non-draft survey', async () => {
      const survey = makeSurvey({ status: 'closed', questions: [makeQuestion()] });

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_DRAFT' }),
          }),
        }),
      );
    });

    it('should throw SURVEY_NOT_FOUND if survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });

    it('should throw when window dates are epoch (blank)', async () => {
      const survey = makeSurvey({
        status: 'draft',
        window_opens_at: new Date(0),
        window_closes_at: new Date(0),
        questions: [makeQuestion()],
      });

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'WINDOW_DATES_REQUIRED' }),
          }),
        }),
      );
    });
  });

  // ─── B3: CLOSE ────────────────────────────────────────────────────────────

  describe('close', () => {
    it('should close active survey and set results_released', async () => {
      const survey = makeSurvey({ status: 'active' });
      const closed = { ...survey, status: 'closed', results_released: true };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffSurvey.update.mockResolvedValue(closed);

      const result = await service.close(TENANT_ID, SURVEY_ID);

      expect(result.status).toBe('closed');
      expect(result.results_released).toBe(true);
      expect(mockRlsTx.staffSurvey.update).toHaveBeenCalledWith({
        where: { id: SURVEY_ID },
        data: { status: 'closed', results_released: true },
      });
    });

    it('should throw 409 when closing non-active survey', async () => {
      const survey = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.close(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_ACTIVE' }),
          }),
        }),
      );
    });

    it('should throw 409 when closing closed survey', async () => {
      const survey = makeSurvey({ status: 'closed' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.close(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_ACTIVE' }),
          }),
        }),
      );
    });

    it('should throw SURVEY_NOT_FOUND if survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(service.close(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });
  });

  // ─── B4: SUBMIT RESPONSE ─────────────────────────────────────────────────

  describe('submitResponse', () => {
    const makeActiveSurveyInWindow = (
      overrides: Partial<{
        moderation_enabled: boolean;
        questions: ReturnType<typeof makeQuestion>[];
      }> = {},
    ) =>
      makeSurvey({
        status: 'active',
        window_opens_at: pastDate(1),
        window_closes_at: futureDate(7),
        moderation_enabled: overrides.moderation_enabled ?? true,
        questions: overrides.questions ?? [
          makeQuestion({ id: QUESTION_ID_1, question_type: 'likert_5', display_order: 0 }),
          makeQuestion({ id: QUESTION_ID_2, question_type: 'freeform', display_order: 1 }),
        ],
      });

    const staffProfile = { id: STAFF_PROFILE_ID, tenant_id: TENANT_ID, user_id: USER_ID };

    it('should store participation token and responses with no user_id', async () => {
      const survey = makeActiveSurveyInWindow();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);
      mockRlsTx.surveyParticipationToken.create.mockResolvedValue({});
      mockRlsTx.surveyResponse.create
        .mockResolvedValueOnce({ id: RESPONSE_ID_1, moderation_status: 'approved' })
        .mockResolvedValueOnce({ id: RESPONSE_ID_2, moderation_status: 'pending' });

      const result = await service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
        answers: [
          { question_id: QUESTION_ID_1, answer_value: 4 },
          { question_id: QUESTION_ID_2, answer_text: 'I feel good' },
        ],
      });

      expect(result).toEqual({ submitted: true });

      // Verify token was created
      expect(mockRlsTx.surveyParticipationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          survey_id: SURVEY_ID,
          token_hash: TOKEN_HASH,
        }),
      });

      // Verify responses have no user_id field
      const responseCalls = mockRlsTx.surveyResponse.create.mock.calls;
      for (const call of responseCalls) {
        const data = (call[0] as { data: Record<string, unknown> }).data;
        expect(data).not.toHaveProperty('user_id');
        expect(data).not.toHaveProperty('staff_profile_id');
      }

      // Verify moderation scan enqueued for freeform (with moderation enabled)
      expect(mockQueue.add).toHaveBeenCalledWith('wellbeing:moderation-scan', {
        tenant_id: TENANT_ID,
        survey_id: SURVEY_ID,
        response_id: RESPONSE_ID_2,
      });
    });

    it('should set moderation_status to approved for likert/single_choice', async () => {
      const survey = makeActiveSurveyInWindow({
        questions: [
          makeQuestion({ id: QUESTION_ID_1, question_type: 'likert_5', display_order: 0 }),
          makeQuestion({ id: QUESTION_ID_2, question_type: 'single_choice', display_order: 1 }),
        ],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);
      mockRlsTx.surveyParticipationToken.create.mockResolvedValue({});
      mockRlsTx.surveyResponse.create
        .mockResolvedValueOnce({ id: RESPONSE_ID_1, moderation_status: 'approved' })
        .mockResolvedValueOnce({ id: RESPONSE_ID_2, moderation_status: 'approved' });

      await service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
        answers: [
          { question_id: QUESTION_ID_1, answer_value: 3 },
          { question_id: QUESTION_ID_2, answer_value: 2 },
        ],
      });

      // Both should be approved
      for (const call of mockRlsTx.surveyResponse.create.mock.calls) {
        const data = (call[0] as { data: Record<string, unknown> }).data;
        expect(data.moderation_status).toBe('approved');
      }

      // No moderation scan should be enqueued
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should set freeform to approved when moderation is disabled', async () => {
      const survey = makeActiveSurveyInWindow({
        moderation_enabled: false,
        questions: [
          makeQuestion({ id: QUESTION_ID_1, question_type: 'freeform', display_order: 0 }),
        ],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);
      mockRlsTx.surveyParticipationToken.create.mockResolvedValue({});
      mockRlsTx.surveyResponse.create.mockResolvedValue({
        id: RESPONSE_ID_1,
        moderation_status: 'approved',
      });

      await service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
        answers: [{ question_id: QUESTION_ID_1, answer_text: 'Open text' }],
      });

      const data = (
        mockRlsTx.surveyResponse.create.mock.calls[0][0] as { data: Record<string, unknown> }
      ).data;
      expect(data.moderation_status).toBe('approved');

      // No moderation scan when moderation is disabled
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should throw 409 ALREADY_RESPONDED on duplicate submission', async () => {
      const survey = makeActiveSurveyInWindow();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue({
        survey_id: SURVEY_ID,
        token_hash: TOKEN_HASH,
        created_date: new Date(),
      });

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'ALREADY_RESPONDED' }),
          }),
        }),
      );
    });

    it('should throw when survey is not active', async () => {
      const survey = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_ACTIVE' }),
          }),
        }),
      );
    });

    it('should throw when survey is closed', async () => {
      const survey = makeSurvey({ status: 'closed' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_ACTIVE' }),
          }),
        }),
      );
    });

    it('should throw 403 OUTSIDE_SURVEY_WINDOW when before window opens', async () => {
      const survey = makeSurvey({
        status: 'active',
        window_opens_at: futureDate(1),
        window_closes_at: futureDate(8),
        questions: [makeQuestion()],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'OUTSIDE_SURVEY_WINDOW' }),
          }),
        }),
      );
    });

    it('should throw 403 OUTSIDE_SURVEY_WINDOW when after window closes', async () => {
      const survey = makeSurvey({
        status: 'active',
        window_opens_at: pastDate(8),
        window_closes_at: pastDate(1),
        questions: [makeQuestion()],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'OUTSIDE_SURVEY_WINDOW' }),
          }),
        }),
      );
    });

    it('should throw SURVEY_NOT_FOUND if survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_NOT_FOUND' }),
          }),
        }),
      );
    });

    it('should throw NOT_STAFF when user has no staff profile', async () => {
      const survey = makeActiveSurveyInWindow();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
          answers: [{ question_id: QUESTION_ID_1, answer_value: 3 }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'NOT_STAFF' }),
          }),
        }),
      );
    });

    it('should enqueue moderation scan for each freeform response when moderation enabled', async () => {
      const survey = makeActiveSurveyInWindow({
        moderation_enabled: true,
        questions: [
          makeQuestion({ id: QUESTION_ID_1, question_type: 'likert_5', display_order: 0 }),
          makeQuestion({ id: QUESTION_ID_2, question_type: 'freeform', display_order: 1 }),
          makeQuestion({ id: QUESTION_ID_3, question_type: 'freeform', display_order: 2 }),
        ],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);
      mockRlsTx.surveyParticipationToken.create.mockResolvedValue({});
      mockRlsTx.surveyResponse.create
        .mockResolvedValueOnce({ id: RESPONSE_ID_1, moderation_status: 'approved' }) // likert
        .mockResolvedValueOnce({ id: RESPONSE_ID_2, moderation_status: 'pending' }) // freeform 1
        .mockResolvedValueOnce({ id: RESPONSE_ID_3, moderation_status: 'pending' }); // freeform 2

      await service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
        answers: [
          { question_id: QUESTION_ID_1, answer_value: 4 },
          { question_id: QUESTION_ID_2, answer_text: 'Text 1' },
          { question_id: QUESTION_ID_3, answer_text: 'Text 2' },
        ],
      });

      // Should enqueue moderation-scan for both freeform responses but not the likert
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith('wellbeing:moderation-scan', {
        tenant_id: TENANT_ID,
        survey_id: SURVEY_ID,
        response_id: RESPONSE_ID_2,
      });
      expect(mockQueue.add).toHaveBeenCalledWith('wellbeing:moderation-scan', {
        tenant_id: TENANT_ID,
        survey_id: SURVEY_ID,
        response_id: RESPONSE_ID_3,
      });
    });
  });

  // ─── B5: GET ACTIVE SURVEY ────────────────────────────────────────────────

  describe('getActiveSurvey', () => {
    it('should return active survey with hasResponded=false when not responded', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);

      const result = await service.getActiveSurvey(TENANT_ID, USER_ID);

      expect(result).not.toBeNull();
      expect(result?.hasResponded).toBe(false);
      expect(result?.questions).toHaveLength(1);
    });

    it('should return active survey with hasResponded=true when already responded', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue({
        survey_id: SURVEY_ID,
        token_hash: TOKEN_HASH,
        created_date: new Date(),
      });

      const result = await service.getActiveSurvey(TENANT_ID, USER_ID);

      expect(result).not.toBeNull();
      expect(result?.hasResponded).toBe(true);
    });

    it('should return null when no active survey exists', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      const result = await service.getActiveSurvey(TENANT_ID, USER_ID);

      expect(result).toBeNull();
      // Should NOT attempt HMAC computation when no survey
      expect(mockHmacService.computeTokenHash).not.toHaveBeenCalled();
    });

    it('should call HMAC with correct arguments', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);

      await service.getActiveSurvey(TENANT_ID, USER_ID);

      expect(mockHmacService.computeTokenHash).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID, USER_ID);
    });
  });

  // ─── Single Active Enforcement (Integration-Level) ────────────────────────

  describe('single active enforcement', () => {
    it('should prevent activating a second survey when one is already active', async () => {
      // Survey A is already active
      const surveyA = makeSurvey({ id: SURVEY_ID, status: 'active' });
      // Survey B is a draft to be activated
      const surveyB = makeSurvey({
        id: SURVEY_ID_B,
        status: 'draft',
        questions: [makeQuestion()],
      });

      mockRlsTx.staffSurvey.findFirst
        .mockResolvedValueOnce(surveyB) // find survey B
        .mockResolvedValueOnce(surveyA); // found active survey A

      await expect(service.activate(TENANT_ID, SURVEY_ID_B)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'SURVEY_ALREADY_ACTIVE' }),
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL BRANCH COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create — branches', () => {
    it('should skip createMany when questions array is empty', async () => {
      const dto = {
        ...makeCreateDto(),
        questions: [],
      };
      const createdSurvey = { ...makeSurvey(), questions: [] };

      mockRlsTx.staffSurvey.create.mockResolvedValue(createdSurvey);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(createdSurvey);

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockRlsTx.surveyQuestion.createMany).not.toHaveBeenCalled();
    });

    it('should persist provided values for optional DTO fields', async () => {
      const dto = {
        title: 'Minimal',
        frequency: 'fortnightly' as const,
        min_response_threshold: 5,
        dept_drill_down_threshold: 8,
        moderation_enabled: false,
        window_opens_at: futureDate(1).toISOString(),
        window_closes_at: futureDate(8).toISOString(),
        questions: [
          {
            question_text: 'Q1',
            question_type: 'likert_5' as const,
            display_order: 0,
            is_required: true,
          },
        ],
      };
      const createdSurvey = makeSurvey();
      mockRlsTx.staffSurvey.create.mockResolvedValue(createdSurvey);
      mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(createdSurvey);

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockRlsTx.staffSurvey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: null,
          frequency: 'fortnightly',
          min_response_threshold: 5,
          dept_drill_down_threshold: 8,
          moderation_enabled: false,
        }),
      });
    });
  });

  describe('update — branches', () => {
    it('should not call staffSurvey.update when no update fields provided', async () => {
      const existing = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(existing);

      // Provide only empty object — no updatable fields
      await service.update(TENANT_ID, SURVEY_ID, {});

      expect(mockRlsTx.staffSurvey.update).not.toHaveBeenCalled();
      // Should not touch questions either
      expect(mockRlsTx.surveyQuestion.deleteMany).not.toHaveBeenCalled();
    });

    it('should replace questions with empty array when explicitly provided', async () => {
      const existing = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.surveyQuestion.deleteMany.mockResolvedValue({ count: 1 });
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue({ ...existing, questions: [] });

      await service.update(TENANT_ID, SURVEY_ID, { questions: [] });

      expect(mockRlsTx.surveyQuestion.deleteMany).toHaveBeenCalledWith({
        where: { survey_id: SURVEY_ID },
      });
      // Should NOT call createMany since the array is empty
      expect(mockRlsTx.surveyQuestion.createMany).not.toHaveBeenCalled();
    });

    it('should reject invalid window dates when both are provided', async () => {
      await expect(
        service.update(TENANT_ID, SURVEY_ID, {
          window_opens_at: futureDate(8).toISOString(),
          window_closes_at: futureDate(1).toISOString(),
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'INVALID_WINDOW_DATES' }),
          }),
        }),
      );
    });

    it('should not validate window dates when only opens_at is provided', async () => {
      const existing = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.update.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(existing);

      await expect(
        service.update(TENANT_ID, SURVEY_ID, {
          window_opens_at: futureDate(8).toISOString(),
        }),
      ).resolves.toBeDefined();
    });

    it('should not validate window dates when only closes_at is provided', async () => {
      const existing = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.update.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(existing);

      await expect(
        service.update(TENANT_ID, SURVEY_ID, {
          window_closes_at: futureDate(8).toISOString(),
        }),
      ).resolves.toBeDefined();
    });

    it('should update individual fields separately', async () => {
      const existing = makeSurvey({ status: 'draft' });
      const updated = { ...existing, title: 'New Title' };
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(existing);
      mockRlsTx.staffSurvey.update.mockResolvedValue(updated);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue(updated);

      await service.update(TENANT_ID, SURVEY_ID, {
        title: 'New Title',
        description: 'New desc',
        frequency: 'weekly',
        min_response_threshold: 3,
        dept_drill_down_threshold: 8,
        moderation_enabled: false,
      });

      expect(mockRlsTx.staffSurvey.update).toHaveBeenCalledWith({
        where: { id: SURVEY_ID },
        data: expect.objectContaining({
          title: 'New Title',
          description: 'New desc',
          frequency: 'weekly',
          min_response_threshold: 3,
          dept_drill_down_threshold: 8,
          moderation_enabled: false,
        }),
      });
    });
  });

  describe('clone — branches', () => {
    it('should skip createMany when source has no questions', async () => {
      const source = makeSurvey({ status: 'closed', questions: [] });
      const cloned = { ...source, id: SURVEY_ID_B, status: 'draft', created_by: USER_ID };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(source);
      mockRlsTx.staffSurvey.create.mockResolvedValue(cloned);
      mockRlsTx.staffSurvey.findUnique.mockResolvedValue({ ...cloned, questions: [] });

      const result = await service.clone(TENANT_ID, SURVEY_ID, USER_ID);

      expect(result.status).toBe('draft');
      expect(mockRlsTx.surveyQuestion.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne — branches', () => {
    it('should not compute eligible_staff_count or response_rate for draft survey', async () => {
      const survey = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.count.mockResolvedValue(0);

      const result = await service.findOne(TENANT_ID, SURVEY_ID);

      expect(result.eligible_staff_count).toBeUndefined();
      expect(result.response_rate).toBeUndefined();
    });
  });

  describe('findAll — branches', () => {
    it('should apply custom sort', async () => {
      mockRlsTx.staffSurvey.findMany.mockResolvedValue([]);
      mockRlsTx.staffSurvey.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 2,
        pageSize: 10,
        sortBy: 'title',
        sortOrder: 'asc',
      });

      expect(mockRlsTx.staffSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: 'asc' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('activate — branches', () => {
    it('should throw WINDOW_DATES_REQUIRED when only opens_at is epoch', async () => {
      const survey = makeSurvey({
        status: 'draft',
        window_opens_at: new Date(0),
        window_closes_at: futureDate(7),
        questions: [makeQuestion()],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'WINDOW_DATES_REQUIRED' }),
          }),
        }),
      );
    });

    it('should throw WINDOW_DATES_REQUIRED when only closes_at is epoch', async () => {
      const survey = makeSurvey({
        status: 'draft',
        window_opens_at: futureDate(1),
        window_closes_at: new Date(0),
        questions: [makeQuestion()],
      });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(service.activate(TENANT_ID, SURVEY_ID)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'WINDOW_DATES_REQUIRED' }),
          }),
        }),
      );
    });
  });

  describe('submitResponse — branches', () => {
    it('should set approved status for answer whose question_id is not in the map', async () => {
      const survey = makeSurvey({
        status: 'active',
        window_opens_at: pastDate(1),
        window_closes_at: futureDate(7),
        moderation_enabled: true,
        questions: [makeQuestion({ id: QUESTION_ID_1, question_type: 'likert_5' })],
      });
      const staffProfile = { id: STAFF_PROFILE_ID, tenant_id: TENANT_ID, user_id: USER_ID };

      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(staffProfile);
      mockRlsTx.surveyParticipationToken.findUnique.mockResolvedValue(null);
      mockRlsTx.surveyParticipationToken.create.mockResolvedValue({});
      mockRlsTx.surveyResponse.create.mockResolvedValue({
        id: RESPONSE_ID_1,
        moderation_status: 'approved',
      });

      // Answer with question_id that is NOT in the question map
      await service.submitResponse(TENANT_ID, SURVEY_ID, USER_ID, {
        answers: [{ question_id: 'unknown-question-id', answer_value: 4 }],
      });

      // question is undefined, so isFreeform = false, moderationStatus = 'approved'
      const data = (
        mockRlsTx.surveyResponse.create.mock.calls[0]![0] as { data: Record<string, unknown> }
      ).data;
      expect(data.moderation_status).toBe('approved');
    });
  });
});
