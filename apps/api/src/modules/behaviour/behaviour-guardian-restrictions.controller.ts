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
  createGuardianRestrictionSchema,
  listGuardianRestrictionsQuerySchema,
  revokeGuardianRestrictionSchema,
  updateGuardianRestrictionSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourGuardianRestrictionsController {
  constructor(private readonly restrictionsService: BehaviourGuardianRestrictionsService) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  @Post('behaviour/guardian-restrictions')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createGuardianRestrictionSchema))
    dto: z.infer<typeof createGuardianRestrictionSchema>,
  ) {
    return this.restrictionsService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  @Get('behaviour/guardian-restrictions')
  @RequiresPermission('behaviour.admin')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listGuardianRestrictionsQuerySchema))
    query: z.infer<typeof listGuardianRestrictionsQuerySchema>,
  ) {
    return this.restrictionsService.list(tenant.tenant_id, query);
  }

  // ─── List Active (must be above :id route) ──────────────────────────────────

  @Get('behaviour/guardian-restrictions/active')
  @RequiresPermission('behaviour.admin')
  async listActive(@CurrentTenant() tenant: TenantContext) {
    return this.restrictionsService.listActive(tenant.tenant_id);
  }

  // ─── Get Detail ──────────────────────────────────────────────────────────────

  @Get('behaviour/guardian-restrictions/:id')
  @RequiresPermission('behaviour.admin')
  async getDetail(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.restrictionsService.getDetail(tenant.tenant_id, id);
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  @Patch('behaviour/guardian-restrictions/:id')
  @RequiresPermission('behaviour.admin')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGuardianRestrictionSchema))
    dto: z.infer<typeof updateGuardianRestrictionSchema>,
  ) {
    return this.restrictionsService.update(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Revoke ──────────────────────────────────────────────────────────────────

  @Post('behaviour/guardian-restrictions/:id/revoke')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revokeGuardianRestrictionSchema))
    dto: z.infer<typeof revokeGuardianRestrictionSchema>,
  ) {
    return this.restrictionsService.revoke(tenant.tenant_id, id, user.sub, dto.reason);
  }
}
