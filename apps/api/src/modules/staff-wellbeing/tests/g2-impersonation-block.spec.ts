import 'reflect-metadata';

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  BLOCK_IMPERSONATION_KEY,
} from '../../../common/decorators/block-impersonation.decorator';
import { BlockImpersonationGuard } from '../../../common/guards/block-impersonation.guard';
import { AggregateWorkloadController } from '../controllers/aggregate-workload.controller';
import { BoardReportController } from '../controllers/board-report.controller';
import { PersonalWorkloadController } from '../controllers/personal-workload.controller';
import { ResourceController } from '../controllers/resource.controller';
import { SurveyResultsController } from '../controllers/survey-results.controller';
import { SurveyController } from '../controllers/survey.controller';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock ExecutionContext for guard testing.
 * The handler metadata resolves to null so only class-level metadata applies.
 */
function createMockContext(
  controller: new (...args: never[]) => unknown,
  impersonating: boolean,
) {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        currentUser: { sub: 'user-1', impersonating },
      }),
    }),
  } as never;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('G2 — Impersonation Block (all wellbeing endpoints)', () => {
  const controllers = [
    { name: 'SurveyController', cls: SurveyController },
    { name: 'SurveyResultsController', cls: SurveyResultsController },
    { name: 'PersonalWorkloadController', cls: PersonalWorkloadController },
    { name: 'AggregateWorkloadController', cls: AggregateWorkloadController },
    { name: 'BoardReportController', cls: BoardReportController },
    { name: 'ResourceController', cls: ResourceController },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Metadata tests — verify decorator is applied at class level
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level @BlockImpersonation metadata', () => {
    it.each(controllers)(
      '$name should have @BlockImpersonation() on the class',
      ({ cls }) => {
        const blocked = Reflect.getMetadata(BLOCK_IMPERSONATION_KEY, cls);
        expect(blocked).toBe(true);
      },
    );
  });

  describe('class-level BlockImpersonationGuard in UseGuards', () => {
    it.each(controllers)(
      '$name should include BlockImpersonationGuard in class-level guards',
      ({ cls }) => {
        const guards = Reflect.getMetadata('__guards__', cls) as unknown[];
        expect(guards).toBeDefined();
        expect(guards).toContain(BlockImpersonationGuard);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Runtime guard behaviour — verify 403 for impersonating users
  // ═══════════════════════════════════════════════════════════════════════════

  describe('runtime impersonation blocking', () => {
    const reflector = new Reflector();
    const guard = new BlockImpersonationGuard(reflector);

    // Each entry: [description, controller class]
    // We test every controller since every class now has @BlockImpersonation.
    const endpointMatrix: Array<{
      endpoint: string;
      controller: new (...args: never[]) => unknown;
    }> = [
      // PersonalWorkloadController (3 endpoints)
      { endpoint: 'GET /my-workload/summary', controller: PersonalWorkloadController },
      { endpoint: 'GET /my-workload/cover-history', controller: PersonalWorkloadController },
      { endpoint: 'GET /my-workload/timetable-quality', controller: PersonalWorkloadController },
      // AggregateWorkloadController (3 endpoints from spec)
      { endpoint: 'GET /aggregate/workload-summary', controller: AggregateWorkloadController },
      { endpoint: 'GET /aggregate/cover-fairness', controller: AggregateWorkloadController },
      { endpoint: 'GET /aggregate/correlation', controller: AggregateWorkloadController },
      // SurveyController — admin (5 endpoints from spec)
      { endpoint: 'GET /surveys (list)', controller: SurveyController },
      { endpoint: 'GET /surveys/:id', controller: SurveyController },
      { endpoint: 'POST /surveys', controller: SurveyController },
      { endpoint: 'POST /surveys/:id/activate', controller: SurveyController },
      { endpoint: 'POST /surveys/:id/close', controller: SurveyController },
      // SurveyResultsController (4 endpoints from spec)
      { endpoint: 'GET /surveys/:id/results', controller: SurveyResultsController },
      { endpoint: 'GET /surveys/:id/results/comments', controller: SurveyResultsController },
      { endpoint: 'GET /surveys/:id/moderation', controller: SurveyResultsController },
      { endpoint: 'PATCH /surveys/:id/moderation/:rid', controller: SurveyResultsController },
      // SurveyController — staff (2 endpoints from spec)
      { endpoint: 'GET /respond/active', controller: SurveyController },
      { endpoint: 'POST /respond/:surveyId', controller: SurveyController },
      // ResourceController (1 endpoint)
      { endpoint: 'GET /resources', controller: ResourceController },
      // BoardReportController (1 endpoint)
      { endpoint: 'GET /reports/termly-summary', controller: BoardReportController },
    ];

    it.each(endpointMatrix)(
      '$endpoint should throw 403 when user is impersonating',
      ({ controller }) => {
        const ctx = createMockContext(controller, true);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      },
    );

    it.each(endpointMatrix)(
      '$endpoint should allow access when user is NOT impersonating',
      ({ controller }) => {
        const ctx = createMockContext(controller, false);
        expect(guard.canActivate(ctx)).toBe(true);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Guard allows through when no metadata is present
  // ═══════════════════════════════════════════════════════════════════════════

  describe('guard passthrough (no metadata)', () => {
    const reflector = new Reflector();
    const guard = new BlockImpersonationGuard(reflector);

    it('should allow impersonating user when class has no @BlockImpersonation()', () => {
      // A plain class with no decorator
      class UnprotectedController {}

      const ctx = createMockContext(
        UnprotectedController as new (...args: never[]) => unknown,
        true,
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
