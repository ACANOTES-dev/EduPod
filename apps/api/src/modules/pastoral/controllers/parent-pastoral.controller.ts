import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ParentPastoralService } from '../services/parent-pastoral.service';

// ─── Inline Schemas (parent-engagement.schema.ts not yet in barrel) ─────────

const parentPastoralQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const parentSelfReferralSchema = z.object({
  student_id: z.string().uuid(),
  description: z.string().min(10).max(10000),
  category: z.string().optional(),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/parent/pastoral')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ParentPastoralController {
  constructor(private readonly parentPastoralService: ParentPastoralService) {}

  // ─── 1. Get Shared Concerns ──────────────────────────────────────────────

  @Get('concerns')
  @RequiresPermission('pastoral.parent_self_referral')
  async getSharedConcerns(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentPastoralQuerySchema))
    query: z.infer<typeof parentPastoralQuerySchema>,
  ) {
    return this.parentPastoralService.getSharedConcerns(tenant.tenant_id, user.sub, query);
  }

  // ─── 2. Submit Self-Referral ─────────────────────────────────────────────

  @Post('self-referral')
  @RequiresPermission('pastoral.parent_self_referral')
  @HttpCode(HttpStatus.CREATED)
  async submitSelfReferral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(parentSelfReferralSchema))
    dto: z.infer<typeof parentSelfReferralSchema>,
  ) {
    return this.parentPastoralService.submitSelfReferral(tenant.tenant_id, user.sub, dto);
  }

  // ─── 3. Get Intervention Summaries ───────────────────────────────────────

  @Get('interventions')
  @RequiresPermission('pastoral.parent_self_referral')
  async getInterventionSummaries(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentPastoralQuerySchema))
    query: z.infer<typeof parentPastoralQuerySchema>,
  ) {
    return this.parentPastoralService.getInterventionSummaries(
      tenant.tenant_id,
      user.sub,
      query.student_id,
    );
  }
}
