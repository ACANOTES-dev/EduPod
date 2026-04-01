import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { BLOCK_IMPERSONATION_KEY } from '../../../common/decorators/block-impersonation.decorator';
import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { SurveyService } from '../services/survey.service';

import { SurveyController } from './survey.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const QUESTION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER = {
  sub: USER_ID,
  email: 'staff@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mock Service ────────────────────────────────────────────────────────────

const mockSurveyService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  clone: jest.fn(),
  activate: jest.fn(),
  close: jest.fn(),
  submitResponse: jest.fn(),
  getActiveSurvey: jest.fn(),
};

// ─── Mock Response ───────────────────────────────────────────────────────────

const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('SurveyController', () => {
  let controller: SurveyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SurveyController],
      providers: [{ provide: SurveyService, useValue: mockSurveyService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SurveyController>(SurveyController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("staff_wellbeing") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, SurveyController);
      expect(moduleKey).toBe('staff_wellbeing');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', SurveyController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('admin endpoint permissions', () => {
    const adminMethods: Array<keyof SurveyController> = [
      'create',
      'findAll',
      'findOne',
      'update',
      'clone',
      'activate',
      'close',
    ];

    it.each(adminMethods)(
      'should have @RequiresPermission("wellbeing.manage_surveys") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('wellbeing.manage_surveys');
      },
    );
  });

  describe('staff endpoint permissions', () => {
    it('should NOT have @RequiresPermission on submitResponse', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.submitResponse);
      expect(permission).toBeUndefined();
    });

    it('should NOT have @RequiresPermission on getActiveSurvey', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getActiveSurvey);
      expect(permission).toBeUndefined();
    });

    it('should have @BlockImpersonation on the controller class (covers all endpoints)', () => {
      const blocked = Reflect.getMetadata(BLOCK_IMPERSONATION_KEY, SurveyController);
      expect(blocked).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — SURVEY MANAGEMENT DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should delegate to surveyService.create and return the result', async () => {
      const dto = {
        title: 'Staff Wellbeing Q1',
        frequency: 'fortnightly' as const,
        window_opens_at: '2026-04-01T00:00:00.000Z',
        window_closes_at: '2026-04-14T23:59:59.000Z',
        min_response_threshold: 5,
        dept_drill_down_threshold: 10,
        moderation_enabled: true,
        questions: [
          {
            question_text: 'How are you feeling?',
            question_type: 'likert_5' as const,
            display_order: 0,
            is_required: true,
          },
        ],
      };
      const expected = { id: SURVEY_ID, ...dto };
      mockSurveyService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT, USER, dto);

      expect(mockSurveyService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('findAll', () => {
    it('should delegate to surveyService.findAll and return paginated result', async () => {
      const query = { page: 1, pageSize: 20, sortBy: 'created_at', sortOrder: 'desc' as const };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockSurveyService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(TENANT, query);

      expect(mockSurveyService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('findOne', () => {
    it('should delegate to surveyService.findOne and return the survey', async () => {
      const expected = { id: SURVEY_ID, title: 'Staff Wellbeing Q1' };
      mockSurveyService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(TENANT, SURVEY_ID);

      expect(mockSurveyService.findOne).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('should delegate to surveyService.update and return the updated survey', async () => {
      const dto = { title: 'Updated Survey Title' };
      const expected = { id: SURVEY_ID, ...dto };
      mockSurveyService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT, SURVEY_ID, dto);

      expect(mockSurveyService.update).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('clone', () => {
    it('should delegate to surveyService.clone and return the cloned survey', async () => {
      const expected = { id: 'new-survey-id', title: 'Staff Wellbeing Q1 (Copy)' };
      mockSurveyService.clone.mockResolvedValue(expected);

      const result = await controller.clone(TENANT, USER, SURVEY_ID);

      expect(mockSurveyService.clone).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('activate', () => {
    it('should delegate to surveyService.activate and return the activated survey', async () => {
      const expected = { id: SURVEY_ID, status: 'active' };
      mockSurveyService.activate.mockResolvedValue(expected);

      const result = await controller.activate(TENANT, SURVEY_ID);

      expect(mockSurveyService.activate).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID);
      expect(result).toBe(expected);
    });
  });

  describe('close', () => {
    it('should delegate to surveyService.close and return the closed survey', async () => {
      const expected = { id: SURVEY_ID, status: 'closed' };
      mockSurveyService.close.mockResolvedValue(expected);

      const result = await controller.close(TENANT, SURVEY_ID);

      expect(mockSurveyService.close).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF — RESPONSE SUBMISSION & ACTIVE SURVEY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('submitResponse', () => {
    it('should delegate to surveyService.submitResponse and return the result', async () => {
      const dto = {
        answers: [{ question_id: QUESTION_ID, answer_value: 4 }],
      };
      const expected = { submitted: true };
      mockSurveyService.submitResponse.mockResolvedValue(expected);

      const result = await controller.submitResponse(TENANT, USER, SURVEY_ID, dto);

      expect(mockSurveyService.submitResponse).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getActiveSurvey', () => {
    it('should return the active survey when one exists', async () => {
      const expected = {
        survey: { id: SURVEY_ID, title: 'Current Survey', questions: [] },
        hasResponded: false,
      };
      mockSurveyService.getActiveSurvey.mockResolvedValue(expected);

      const mockRes = createMockResponse();
      const result = await controller.getActiveSurvey(TENANT, USER, mockRes as never);

      expect(mockSurveyService.getActiveSurvey).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toBe(expected);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 204 No Content when no active survey exists', async () => {
      mockSurveyService.getActiveSurvey.mockResolvedValue(null);

      const mockRes = createMockResponse();
      const result = await controller.getActiveSurvey(TENANT, USER, mockRes as never);

      expect(mockSurveyService.getActiveSurvey).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(result).toBeUndefined();
    });
  });
});
