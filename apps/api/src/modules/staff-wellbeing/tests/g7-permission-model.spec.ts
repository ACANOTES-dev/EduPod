import 'reflect-metadata';

import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { AggregateWorkloadController } from '../controllers/aggregate-workload.controller';
import { BoardReportController } from '../controllers/board-report.controller';
import { PersonalWorkloadController } from '../controllers/personal-workload.controller';
import { SurveyResultsController } from '../controllers/survey-results.controller';
import { SurveyController } from '../controllers/survey.controller';

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('G7 — Permission Model Verification', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PersonalWorkloadController — auth-only, NO permission decorator
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PersonalWorkloadController (auth-only, no permission required)', () => {
    it('GET /my-workload/summary — should NOT require a permission (auth-only)', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PersonalWorkloadController.prototype.getSummary,
      );
      expect(permission).toBeUndefined();
    });

    it('GET /my-workload/cover-history — should NOT require a permission (auth-only)', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PersonalWorkloadController.prototype.getCoverHistory,
      );
      expect(permission).toBeUndefined();
    });

    it('GET /my-workload/timetable-quality — should NOT require a permission (auth-only)', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PersonalWorkloadController.prototype.getTimetableQuality,
      );
      expect(permission).toBeUndefined();
    });

    it('should NOT include PermissionGuard in class-level guards', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PersonalWorkloadController,
      ) as unknown[];
      expect(guards).toBeDefined();
      expect(guards).not.toContain(PermissionGuard);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. AggregateWorkloadController — requires wellbeing.view_aggregate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AggregateWorkloadController (wellbeing.view_aggregate)', () => {
    it('GET /aggregate/workload-summary — should require wellbeing.view_aggregate', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        AggregateWorkloadController.prototype.getWorkloadSummary,
      );
      expect(permission).toBe('wellbeing.view_aggregate');
    });

    it('should include PermissionGuard in class-level guards', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        AggregateWorkloadController,
      ) as unknown[];
      expect(guards).toBeDefined();
      expect(guards).toContain(PermissionGuard);
    });

    it('staff without wellbeing.view_aggregate cannot access aggregate endpoints (all methods guarded)', () => {
      const methods = [
        'getWorkloadSummary',
        'getCoverFairness',
        'getTimetableQuality',
        'getAbsenceTrends',
        'getSubstitutionPressure',
        'getCorrelation',
      ] as const;

      for (const method of methods) {
        const permission = Reflect.getMetadata(
          REQUIRES_PERMISSION_KEY,
          AggregateWorkloadController.prototype[method],
        );
        expect(permission).toBe('wellbeing.view_aggregate');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SurveyController (admin) — requires wellbeing.manage_surveys
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SurveyController — admin endpoints (wellbeing.manage_surveys)', () => {
    it('GET /surveys (findAll) — should require wellbeing.manage_surveys', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyController.prototype.findAll,
      );
      expect(permission).toBe('wellbeing.manage_surveys');
    });

    it('all admin survey methods should require wellbeing.manage_surveys', () => {
      const adminMethods = [
        'create',
        'findAll',
        'findOne',
        'update',
        'clone',
        'activate',
        'close',
      ] as const;

      for (const method of adminMethods) {
        const permission = Reflect.getMetadata(
          REQUIRES_PERMISSION_KEY,
          SurveyController.prototype[method],
        );
        expect(permission).toBe('wellbeing.manage_surveys');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SurveyResultsController — requires wellbeing.view_survey_results
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SurveyResultsController (wellbeing.view_survey_results)', () => {
    it('GET /surveys/:id/results — should require wellbeing.view_survey_results', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyResultsController.prototype.getResults,
      );
      expect(permission).toBe('wellbeing.view_survey_results');
    });

    it('GET /surveys/:id/results/comments — should require wellbeing.view_survey_results', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyResultsController.prototype.getModeratedComments,
      );
      expect(permission).toBe('wellbeing.view_survey_results');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SurveyResultsController — moderation requires wellbeing.moderate_surveys
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SurveyResultsController — moderation (wellbeing.moderate_surveys)', () => {
    it('GET /surveys/:id/moderation — should require wellbeing.moderate_surveys', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyResultsController.prototype.listModerationQueue,
      );
      expect(permission).toBe('wellbeing.moderate_surveys');
    });

    it('PATCH /surveys/:id/moderation/:responseId — should require wellbeing.moderate_surveys', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyResultsController.prototype.moderateResponse,
      );
      expect(permission).toBe('wellbeing.moderate_surveys');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Board member cannot access aggregate (requires view_aggregate, not view_board_report)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Board member access boundaries', () => {
    it('GET /aggregate/workload-summary — requires wellbeing.view_aggregate (board members lack this)', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        AggregateWorkloadController.prototype.getWorkloadSummary,
      );
      // Board members have wellbeing.view_board_report, NOT wellbeing.view_aggregate
      expect(permission).toBe('wellbeing.view_aggregate');
      expect(permission).not.toBe('wellbeing.view_board_report');
    });

    it('GET /surveys/:id/results — requires wellbeing.view_survey_results (board members lack this)', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyResultsController.prototype.getResults,
      );
      // Board members have wellbeing.view_board_report, NOT wellbeing.view_survey_results
      expect(permission).toBe('wellbeing.view_survey_results');
      expect(permission).not.toBe('wellbeing.view_board_report');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. BoardReportController — requires wellbeing.view_board_report
  // ═══════════════════════════════════════════════════════════════════════════

  describe('BoardReportController (wellbeing.view_board_report)', () => {
    it('GET /reports/termly-summary — should require wellbeing.view_board_report', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        BoardReportController.prototype.getTermlySummary,
      );
      expect(permission).toBe('wellbeing.view_board_report');
    });

    it('should include PermissionGuard in class-level guards', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        BoardReportController,
      ) as unknown[];
      expect(guards).toBeDefined();
      expect(guards).toContain(PermissionGuard);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Staff-facing endpoints — no permission required (auth-only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Staff-facing endpoints (auth-only, no permission)', () => {
    it('POST /respond/:surveyId — should NOT require a permission', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyController.prototype.submitResponse,
      );
      expect(permission).toBeUndefined();
    });

    it('GET /respond/active — should NOT require a permission', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SurveyController.prototype.getActiveSurvey,
      );
      expect(permission).toBeUndefined();
    });
  });
});
