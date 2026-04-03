import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  createSurveySchema,
  submitSurveyResponseSchema,
  updateSurveySchema,
} from '@school/shared/staff-wellbeing';

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
import { SurveyService } from '../services/survey.service';

// ─── Inline query schema for listing surveys ────────────────────────────────

const listSurveysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@BlockImpersonation()
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, BlockImpersonationGuard)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — Survey Management
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. Create Survey ──────────────────────────────────────────────────

  @Post('staff-wellbeing/surveys')
  @RequiresPermission('wellbeing.manage_surveys')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSurveySchema))
    dto: z.infer<typeof createSurveySchema>,
  ) {
    return this.surveyService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── 2. List Surveys ──────────────────────────────────────────────────

  @Get('staff-wellbeing/surveys')
  @RequiresPermission('wellbeing.manage_surveys')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listSurveysQuerySchema))
    query: z.infer<typeof listSurveysQuerySchema>,
  ) {
    return this.surveyService.findAll(tenant.tenant_id, query);
  }

  // ─── 3. Get Survey by ID ──────────────────────────────────────────────

  @Get('staff-wellbeing/surveys/:id')
  @RequiresPermission('wellbeing.manage_surveys')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveyService.findOne(tenant.tenant_id, id);
  }

  // ─── 4. Update Survey ─────────────────────────────────────────────────

  @Patch('staff-wellbeing/surveys/:id')
  @RequiresPermission('wellbeing.manage_surveys')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSurveySchema))
    dto: z.infer<typeof updateSurveySchema>,
  ) {
    return this.surveyService.update(tenant.tenant_id, id, dto);
  }

  // ─── 5. Clone Survey ──────────────────────────────────────────────────

  @Post('staff-wellbeing/surveys/:id/clone')
  @RequiresPermission('wellbeing.manage_surveys')
  @HttpCode(HttpStatus.CREATED)
  async clone(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.surveyService.clone(tenant.tenant_id, id, user.sub);
  }

  // ─── 6. Activate Survey ───────────────────────────────────────────────

  @Post('staff-wellbeing/surveys/:id/activate')
  @RequiresPermission('wellbeing.manage_surveys')
  @HttpCode(HttpStatus.OK)
  async activate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveyService.activate(tenant.tenant_id, id);
  }

  // ─── 7. Close Survey ──────────────────────────────────────────────────

  @Post('staff-wellbeing/surveys/:id/close')
  @RequiresPermission('wellbeing.manage_surveys')
  @HttpCode(HttpStatus.OK)
  async close(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveyService.close(tenant.tenant_id, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF — Response Submission & Active Survey
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 8. Submit Survey Response (anonymous — block impersonation) ───────

  @Post('staff-wellbeing/respond/:surveyId')
  @HttpCode(HttpStatus.CREATED)
  async submitResponse(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @Body(new ZodValidationPipe(submitSurveyResponseSchema))
    dto: z.infer<typeof submitSurveyResponseSchema>,
  ) {
    return this.surveyService.submitResponse(tenant.tenant_id, surveyId, user.sub, dto);
  }

  // ─── 9. Get Active Survey ─────────────────────────────────────────────

  @Get('staff-wellbeing/respond/active')
  async getActiveSurvey(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.surveyService.getActiveSurvey(tenant.tenant_id, user.sub);

    if (!result) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }

    return result;
  }
}
