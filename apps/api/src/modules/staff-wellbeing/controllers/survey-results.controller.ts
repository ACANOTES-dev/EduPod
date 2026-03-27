import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { moderateResponseSchema, surveyResultsQuerySchema } from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { BlockImpersonation } from '../../../common/decorators/block-impersonation.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { BlockImpersonationGuard } from '../../../common/guards/block-impersonation.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { SurveyResultsService } from '../services/survey-results.service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@BlockImpersonation()
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, BlockImpersonationGuard)
export class SurveyResultsController {
  constructor(private readonly surveyResultsService: SurveyResultsService) {}

  // ─── 1. Get Survey Results ────────────────────────────────────────────────

  @Get('staff-wellbeing/surveys/:id/results')
  @RequiresPermission('wellbeing.view_survey_results')
  async getResults(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(surveyResultsQuerySchema))
    query: z.infer<typeof surveyResultsQuerySchema>,
  ) {
    return this.surveyResultsService.getResults(
      tenant.tenant_id,
      id,
      query.department ? { department: query.department } : undefined,
    );
  }

  // ─── 2. List Moderation Queue ────────────────────────────────────────────

  @Get('staff-wellbeing/surveys/:id/moderation')
  @RequiresPermission('wellbeing.moderate_surveys')
  async listModerationQueue(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.surveyResultsService.listModerationQueue(tenant.tenant_id, id);
  }

  // ─── 3. Moderate Response ────────────────────────────────────────────────

  @Patch('staff-wellbeing/surveys/:id/moderation/:responseId')
  @RequiresPermission('wellbeing.moderate_surveys')
  async moderateResponse(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @Body(new ZodValidationPipe(moderateResponseSchema))
    dto: z.infer<typeof moderateResponseSchema>,
  ) {
    return this.surveyResultsService.moderateResponse(
      tenant.tenant_id,
      id,
      responseId,
      dto,
      user.sub,
    );
  }

  // ─── 4. Get Moderated Comments ───────────────────────────────────────────

  @Get('staff-wellbeing/surveys/:id/results/comments')
  @RequiresPermission('wellbeing.view_survey_results')
  async getModeratedComments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.surveyResultsService.getModeratedComments(tenant.tenant_id, id);
  }
}
