import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AiFlagGuard } from '../ai-flags/decorators/ai-flag.guard';
import { RequiresAiFlag } from '../ai-flags/decorators/requires-ai-flag.decorator';

import { AiPredictionsService } from './ai-predictions.service';

/**
 * AiPredictionsController — exposes the three flagship prediction endpoints
 * plus the bulk drill-down for the at-risk-students KPI.
 *
 * Every route is gated by:
 *
 * 1. `AuthGuard`    — the request carries a valid JWT.
 * 2. `PermissionGuard` + `@RequiresPermission('reports.ai.predictions')`
 *    — the caller has the predictions permission (seeded by impl 01 onto
 *    owner / principal / VP / admin roles).
 * 3. `AiFlagGuard`  + `@RequiresAiFlag('reports_predictions')` — the
 *    tenant has flipped the `tenant_ai_flags.enabled = true` row for the
 *    `reports_predictions` module key. Default: false; tenants opt in
 *    via the Reports Settings page (impl 21).
 *
 * All routes return `503 AI_UNAVAILABLE` when the Anthropic call fails
 * and `503 AI_PREDICTION_UNPARSEABLE` when the response can't be Zod-
 * validated. We never synthesise a fallback prediction (see PLAN.md §6).
 */
@Controller('v1/reports/predictions')
@UseGuards(AuthGuard, PermissionGuard, AiFlagGuard)
export class AiPredictionsController {
  constructor(private readonly aiPredictions: AiPredictionsService) {}

  // ─── Bulk drill-down for the at-risk-students KPI ──────────────────────
  //
  // Static route registered before the `:studentId` dynamic route so
  // `ParseUUIDPipe` doesn't intercept "bulk" with a 400 (same lesson as
  // impl 02's `builder/draft` ordering fix in `fcfeb4f3`).

  // GET /v1/reports/predictions/student-risk/bulk?year_group_id=X&page=1&pageSize=20
  @Get('student-risk/bulk')
  @RequiresAiFlag('reports_predictions')
  @RequiresPermission('reports.ai.predictions')
  async bulkStudentRisk(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query('year_group_id') yearGroupId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!yearGroupId) {
      throw new BadRequestException({
        code: 'YEAR_GROUP_REQUIRED',
        message: 'Query parameter `year_group_id` is required',
      });
    }
    return this.aiPredictions.bulkPredictStudentRisk(
      tenant.tenant_id,
      user.sub,
      yearGroupId,
      parsePositiveInt(page, 1),
      parsePositiveInt(pageSize, 20),
      refresh === 'true',
    );
  }

  // ─── Student Risk ───────────────────────────────────────────────────────

  // GET /v1/reports/predictions/student-risk/:studentId
  @Get('student-risk/:studentId')
  @RequiresAiFlag('reports_predictions')
  @RequiresPermission('reports.ai.predictions')
  async predictStudentRisk(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.aiPredictions.predictStudentRisk(
      tenant.tenant_id,
      user.sub,
      studentId,
      refresh === 'true',
    );
  }

  // ─── Attendance Forecast ────────────────────────────────────────────────

  // GET /v1/reports/predictions/attendance-forecast/:yearGroupId?weeks=4
  @Get('attendance-forecast/:yearGroupId')
  @RequiresAiFlag('reports_predictions')
  @RequiresPermission('reports.ai.predictions')
  async forecastAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('yearGroupId', ParseUUIDPipe) yearGroupId: string,
    @Query('weeks') weeks?: string,
    @Query('refresh') refresh?: string,
  ) {
    const weeksAhead = clamp(parsePositiveInt(weeks, 4), 1, 52);
    return this.aiPredictions.forecastAttendance(
      tenant.tenant_id,
      user.sub,
      yearGroupId,
      weeksAhead,
      refresh === 'true',
    );
  }

  // ─── Cash-flow Forecast ─────────────────────────────────────────────────

  // GET /v1/reports/predictions/cash-flow-forecast?days=30
  @Get('cash-flow-forecast')
  @RequiresAiFlag('reports_predictions')
  @RequiresPermission('reports.ai.predictions')
  async forecastCashFlow(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('refresh') refresh?: string,
  ) {
    const daysAhead = clamp(parsePositiveInt(days, 30), 1, 365);
    return this.aiPredictions.forecastCashFlow(
      tenant.tenant_id,
      user.sub,
      daysAhead,
      refresh === 'true',
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
