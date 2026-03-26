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
import {
  createExclusionCaseSchema,
  exclusionCaseListQuerySchema,
  exclusionStatusTransitionSchema,
  recordExclusionDecisionSchema,
  updateExclusionCaseSchema,
} from '@school/shared';
import type { ExclusionStatusKey, JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourExclusionCasesService } from './behaviour-exclusion-cases.service';

/** Map API-facing status values to Prisma enum names */
function toExclusionStatus(value: string): ExclusionStatusKey {
  return value === 'hearing_scheduled'
    ? 'hearing_scheduled_exc'
    : (value as ExclusionStatusKey);
}

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourExclusionsController {
  constructor(
    private readonly exclusionCasesService: BehaviourExclusionCasesService,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  @Post('behaviour/exclusion-cases')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createExclusionCaseSchema))
    dto: z.infer<typeof createExclusionCaseSchema>,
  ) {
    return this.exclusionCasesService.create(
      tenant.tenant_id,
      dto,
      user.sub,
    );
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  @Get('behaviour/exclusion-cases')
  @RequiresPermission('behaviour.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(exclusionCaseListQuerySchema))
    query: z.infer<typeof exclusionCaseListQuerySchema>,
  ) {
    return this.exclusionCasesService.list(tenant.tenant_id, query);
  }

  // ─── Parameterised :id routes ───────────────────────────────────────────────

  @Get('behaviour/exclusion-cases/:id')
  @RequiresPermission('behaviour.manage')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exclusionCasesService.getById(tenant.tenant_id, id);
  }

  @Patch('behaviour/exclusion-cases/:id')
  @RequiresPermission('behaviour.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateExclusionCaseSchema))
    dto: z.infer<typeof updateExclusionCaseSchema>,
  ) {
    return this.exclusionCasesService.update(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  @Patch('behaviour/exclusion-cases/:id/status')
  @RequiresPermission('behaviour.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(exclusionStatusTransitionSchema))
    dto: z.infer<typeof exclusionStatusTransitionSchema>,
  ) {
    return this.exclusionCasesService.transitionStatus(
      tenant.tenant_id,
      id,
      toExclusionStatus(dto.status),
      dto.reason,
      user.sub,
    );
  }

  @Post('behaviour/exclusion-cases/:id/generate-notice')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async generateNotice(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exclusionCasesService.generateNotice(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  @Post('behaviour/exclusion-cases/:id/generate-board-pack')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async generateBoardPack(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exclusionCasesService.generateBoardPack(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  @Post('behaviour/exclusion-cases/:id/record-decision')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async recordDecision(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordExclusionDecisionSchema))
    dto: z.infer<typeof recordExclusionDecisionSchema>,
  ) {
    return this.exclusionCasesService.recordDecision(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  @Get('behaviour/exclusion-cases/:id/timeline')
  @RequiresPermission('behaviour.manage')
  async getTimeline(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exclusionCasesService.getTimeline(tenant.tenant_id, id);
  }

  @Get('behaviour/exclusion-cases/:id/documents')
  @RequiresPermission('behaviour.manage')
  async getDocuments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exclusionCasesService.getDocuments(tenant.tenant_id, id);
  }
}
