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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  amendNarrativeSchema,
  createConcernSchema,
  escalateConcernTierSchema,
  listConcernsQuerySchema,
  pastoralEventFiltersSchema,
  shareConcernWithParentSchema,
  updateConcernMetadataSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { ConcernVersionService } from '../services/concern-version.service';
import { ConcernService } from '../services/concern.service';
import { PastoralEventService } from '../services/pastoral-event.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ConcernsController {
  constructor(
    private readonly concernService: ConcernService,
    private readonly versionService: ConcernVersionService,
    private readonly eventService: PastoralEventService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── 1. Create Concern ────────────────────────────────────────────────────

  @Post('pastoral/concerns')
  @RequiresPermission('pastoral.log_concern')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createConcernSchema))
    dto: z.infer<typeof createConcernSchema>,
    @Req() req: Request,
  ) {
    return this.concernService.create(
      tenant.tenant_id,
      user.sub,
      dto,
      req.ip ?? null,
    );
  }

  // ─── 2. List Concerns ─────────────────────────────────────────────────────

  @Get('pastoral/concerns')
  @RequiresPermission('pastoral.view_tier1')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listConcernsQuerySchema))
    query: z.infer<typeof listConcernsQuerySchema>,
  ) {
    const permissions = await this.permissionCacheService.getPermissions(
      user.membership_id!,
    );
    return this.concernService.list(
      tenant.tenant_id,
      user.sub,
      permissions,
      query,
    );
  }

  // ─── 3. Get Concern By ID ─────────────────────────────────────────────────

  @Get('pastoral/concerns/:id')
  @RequiresPermission('pastoral.view_tier1')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const permissions = await this.permissionCacheService.getPermissions(
      user.membership_id!,
    );
    return this.concernService.getById(
      tenant.tenant_id,
      user.sub,
      permissions,
      id,
      req.ip ?? null,
    );
  }

  // ─── 4. Update Concern Metadata ───────────────────────────────────────────

  @Patch('pastoral/concerns/:id')
  @RequiresPermission('pastoral.view_tier2')
  async updateMetadata(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateConcernMetadataSchema))
    dto: z.infer<typeof updateConcernMetadataSchema>,
  ) {
    return this.concernService.updateMetadata(
      tenant.tenant_id,
      user.sub,
      id,
      dto,
    );
  }

  // ─── 5. Escalate Concern Tier ─────────────────────────────────────────────

  @Post('pastoral/concerns/:id/escalate')
  @RequiresPermission('pastoral.view_tier2')
  @HttpCode(HttpStatus.OK)
  async escalateTier(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(escalateConcernTierSchema))
    dto: z.infer<typeof escalateConcernTierSchema>,
    @Req() req: Request,
  ) {
    return this.concernService.escalateTier(
      tenant.tenant_id,
      user.sub,
      id,
      dto,
      req.ip ?? null,
    );
  }

  // ─── 6. Share Concern with Parent ─────────────────────────────────────────

  @Post('pastoral/concerns/:id/share')
  @HttpCode(HttpStatus.OK)
  async shareConcernWithParent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(shareConcernWithParentSchema))
    dto: z.infer<typeof shareConcernWithParentSchema>,
  ) {
    return this.concernService.shareConcernWithParent(
      tenant.tenant_id,
      user.sub,
      user.membership_id!,
      id,
      dto,
    );
  }

  // ─── 6b. Unshare Concern from Parent ───────────────────────────────────────

  @Post('pastoral/concerns/:id/unshare')
  @RequiresPermission('pastoral.view_tier2')
  @HttpCode(HttpStatus.OK)
  async unshareConcernFromParent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.concernService.unshareConcernFromParent(
      tenant.tenant_id,
      user.sub,
      id,
    );
  }

  // ─── 7. Amend Concern Narrative ───────────────────────────────────────────

  @Post('pastoral/concerns/:id/amend')
  @RequiresPermission('pastoral.log_concern')
  @HttpCode(HttpStatus.OK)
  async amendNarrative(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(amendNarrativeSchema))
    dto: z.infer<typeof amendNarrativeSchema>,
    @Req() req: Request,
  ) {
    return this.versionService.amendNarrative(
      tenant.tenant_id,
      user.sub,
      id,
      dto,
      req.ip ?? null,
    );
  }

  // ─── 8. List Concern Versions ─────────────────────────────────────────────

  @Get('pastoral/concerns/:id/versions')
  @RequiresPermission('pastoral.view_tier1')
  async listVersions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.versionService.listVersions(tenant.tenant_id, id);
  }

  // ─── 9. Get Concern Events (Entity History) ──────────────────────────────

  @Get('pastoral/concerns/:id/events')
  @RequiresPermission('pastoral.view_tier2')
  async getEntityEvents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(pastoralEventFiltersSchema))
    query: z.infer<typeof pastoralEventFiltersSchema>,
  ): Promise<{
    data: { id: string; event_type: string; entity_type: string; entity_id: string; student_id: string | null; actor_user_id: string; tier: number; payload: Prisma.JsonValue; ip_address: string | null; created_at: Date }[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    return this.eventService.getEntityHistory(
      tenant.tenant_id,
      user.sub,
      'concern',
      id,
      query.page,
      query.pageSize,
    );
  }

  // ─── 10. Get Concern Categories ───────────────────────────────────────────

  @Get('pastoral/categories')
  @RequiresPermission('pastoral.log_concern')
  async getCategories(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.concernService.getCategories(tenant.tenant_id);
  }

  // ─── 11. Get Student Pastoral Chronology ──────────────────────────────────

  @Get('pastoral/chronology/:studentId')
  @RequiresPermission('pastoral.view_tier1')
  async getStudentChronology(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(pastoralEventFiltersSchema))
    query: z.infer<typeof pastoralEventFiltersSchema>,
  ): Promise<{
    data: { id: string; event_type: string; entity_type: string; entity_id: string; student_id: string | null; actor_user_id: string; tier: number; payload: Prisma.JsonValue; ip_address: string | null; created_at: Date }[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    return this.eventService.getStudentChronology(
      tenant.tenant_id,
      user.sub,
      studentId,
      query.page,
      query.pageSize,
    );
  }
}
