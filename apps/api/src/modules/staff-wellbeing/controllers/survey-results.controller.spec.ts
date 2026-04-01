import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { SurveyResultsService } from '../services/survey-results.service';

import { SurveyResultsController } from './survey-results.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESPONSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mock Service ────────────────────────────────────────────────────────────

const mockSurveyResultsService = {
  getResults: jest.fn(),
  listModerationQueue: jest.fn(),
  moderateResponse: jest.fn(),
  getModeratedComments: jest.fn(),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('SurveyResultsController', () => {
  let controller: SurveyResultsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SurveyResultsController],
      providers: [{ provide: SurveyResultsService, useValue: mockSurveyResultsService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SurveyResultsController>(SurveyResultsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("staff_wellbeing") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, SurveyResultsController);
      expect(moduleKey).toBe('staff_wellbeing');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', SurveyResultsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('permission metadata', () => {
    it('should have @RequiresPermission("wellbeing.view_survey_results") on getResults', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getResults);
      expect(permission).toBe('wellbeing.view_survey_results');
    });

    it('should have @RequiresPermission("wellbeing.view_survey_results") on getModeratedComments', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        controller.getModeratedComments,
      );
      expect(permission).toBe('wellbeing.view_survey_results');
    });

    it('should have @RequiresPermission("wellbeing.moderate_surveys") on listModerationQueue', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        controller.listModerationQueue,
      );
      expect(permission).toBe('wellbeing.moderate_surveys');
    });

    it('should have @RequiresPermission("wellbeing.moderate_surveys") on moderateResponse', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.moderateResponse);
      expect(permission).toBe('wellbeing.moderate_surveys');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELEGATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults', () => {
    it('should delegate to surveyResultsService.getResults without filter when department is absent', async () => {
      const expected = { summary: { total_responses: 10 }, questions: [] };
      mockSurveyResultsService.getResults.mockResolvedValue(expected);

      const result = await controller.getResults(TENANT, SURVEY_ID, {});

      expect(mockSurveyResultsService.getResults).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
        undefined,
      );
      expect(result).toBe(expected);
    });

    it('should delegate to surveyResultsService.getResults with department filter when provided', async () => {
      const expected = { summary: { total_responses: 3 }, questions: [] };
      mockSurveyResultsService.getResults.mockResolvedValue(expected);

      const result = await controller.getResults(TENANT, SURVEY_ID, { department: 'Mathematics' });

      expect(mockSurveyResultsService.getResults).toHaveBeenCalledWith(TENANT_ID, SURVEY_ID, {
        department: 'Mathematics',
      });
      expect(result).toBe(expected);
    });
  });

  describe('listModerationQueue', () => {
    it('should delegate to surveyResultsService.listModerationQueue and return the result', async () => {
      const expected = [{ response_id: RESPONSE_ID, comment: 'Feedback text', status: 'pending' }];
      mockSurveyResultsService.listModerationQueue.mockResolvedValue(expected);

      const result = await controller.listModerationQueue(TENANT, SURVEY_ID);

      expect(mockSurveyResultsService.listModerationQueue).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('moderateResponse', () => {
    it('should delegate to surveyResultsService.moderateResponse with all args including userId', async () => {
      const dto = { status: 'approved' as const };
      const expected = { moderated: true };
      mockSurveyResultsService.moderateResponse.mockResolvedValue(expected);

      const result = await controller.moderateResponse(TENANT, USER, SURVEY_ID, RESPONSE_ID, dto);

      expect(mockSurveyResultsService.moderateResponse).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
        RESPONSE_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });

    it('should pass optional reason when provided', async () => {
      const dto = { status: 'flagged' as const, reason: 'Contains identifying information' };
      const expected = { moderated: true };
      mockSurveyResultsService.moderateResponse.mockResolvedValue(expected);

      const result = await controller.moderateResponse(TENANT, USER, SURVEY_ID, RESPONSE_ID, dto);

      expect(mockSurveyResultsService.moderateResponse).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
        RESPONSE_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getModeratedComments', () => {
    it('should delegate to surveyResultsService.getModeratedComments and return the result', async () => {
      const expected = { comments: [{ response_id: RESPONSE_ID, comment: 'Approved feedback' }] };
      mockSurveyResultsService.getModeratedComments.mockResolvedValue(expected);

      const result = await controller.getModeratedComments(TENANT, SURVEY_ID);

      expect(mockSurveyResultsService.getModeratedComments).toHaveBeenCalledWith(
        TENANT_ID,
        SURVEY_ID,
      );
      expect(result).toBe(expected);
    });
  });
});
