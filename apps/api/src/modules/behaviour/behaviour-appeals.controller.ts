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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  appealListQuerySchema,
  recordAppealDecisionSchema,
  submitAppealSchema,
  updateAppealSchema,
  withdrawAppealSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourAppealsService } from './behaviour-appeals.service';

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAppealsController {
  constructor(private readonly appealsService: BehaviourAppealsService) {}

  // ─── Submit Appeal ──────────────────────────────────────────────────────────

  @Post('behaviour/appeals')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitAppealSchema))
    dto: z.infer<typeof submitAppealSchema>,
  ) {
    return this.appealsService.submit(tenant.tenant_id, user.sub, dto);
  }

  // ─── List Appeals ───────────────────────────────────────────────────────────

  @Get('behaviour/appeals')
  @RequiresPermission('behaviour.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(appealListQuerySchema))
    filters: z.infer<typeof appealListQuerySchema>,
  ) {
    return this.appealsService.list(tenant.tenant_id, filters);
  }

  // ─── Get Appeal by ID ──────────────────────────────────────────────────────

  @Get('behaviour/appeals/:id')
  @RequiresPermission('behaviour.manage')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appealsService.getById(tenant.tenant_id, id);
  }

  // ─── Update Appeal ─────────────────────────────────────────────────────────

  @Patch('behaviour/appeals/:id')
  @RequiresPermission('behaviour.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAppealSchema))
    dto: z.infer<typeof updateAppealSchema>,
  ) {
    return this.appealsService.update(tenant.tenant_id, id, dto, user.sub);
  }

  // ─── Decide Appeal ─────────────────────────────────────────────────────────

  @Post('behaviour/appeals/:id/decide')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordAppealDecisionSchema))
    dto: z.infer<typeof recordAppealDecisionSchema>,
  ) {
    return this.appealsService.decide(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Withdraw Appeal ───────────────────────────────────────────────────────

  @Post('behaviour/appeals/:id/withdraw')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawAppealSchema))
    dto: z.infer<typeof withdrawAppealSchema>,
  ) {
    return this.appealsService.withdraw(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Attachments ───────────────────────────────────────────────────────────

  @Post('behaviour/appeals/:id/attachments')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async uploadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appealsService.uploadAttachment(tenant.tenant_id, id, undefined);
  }

  @Get('behaviour/appeals/:id/attachments')
  @RequiresPermission('behaviour.manage')
  async getAttachments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appealsService.getAttachments(tenant.tenant_id, id);
  }

  // ─── Documents ─────────────────────────────────────────────────────────────

  @Post('behaviour/appeals/:id/generate-decision-letter')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async generateDecisionLetter(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appealsService.generateDecisionLetter(tenant.tenant_id, id);
  }

  @Get('behaviour/appeals/:id/evidence-bundle')
  @RequiresPermission('behaviour.manage')
  async getEvidenceBundle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appealsService.getEvidenceBundle(tenant.tenant_id, id);
  }
}
