import {
  Body,
  Controller,
  Delete,
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
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import {
  createProfessionalInvolvementBodySchema,
  type CreateProfessionalInvolvementBody,
} from './dto/create-professional-involvement.dto';
import {
  listProfessionalInvolvementsQuerySchema,
  type ListProfessionalInvolvementsQuery,
} from './dto/list-professional-involvements.dto';
import {
  updateProfessionalInvolvementSchema,
  type UpdateProfessionalInvolvementDto,
} from './dto/update-professional-involvement.dto';
import { SenProfessionalService } from './sen-professional.service';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenProfessionalController {
  constructor(
    private readonly senProfessionalService: SenProfessionalService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  // POST /v1/sen/profiles/:profileId/professionals
  @Post('sen/profiles/:profileId/professionals')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body(new ZodValidationPipe(createProfessionalInvolvementBodySchema))
    dto: CreateProfessionalInvolvementBody,
  ) {
    return this.senProfessionalService.create(tenant.tenant_id, profileId, dto);
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  // GET /v1/sen/profiles/:profileId/professionals
  @Get('sen/profiles/:profileId/professionals')
  @RequiresPermission('sen.view')
  async findAllByProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query(new ZodValidationPipe(listProfessionalInvolvementsQuerySchema))
    query: ListProfessionalInvolvementsQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const hasSensitiveAccess = permissions.includes('sen.view_sensitive');

    if (!hasSensitiveAccess) {
      return this.senProfessionalService.countByProfile(tenant.tenant_id, profileId);
    }

    return this.senProfessionalService.findAllByProfile(tenant.tenant_id, profileId, query);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  // PATCH /v1/sen/professionals/:id
  @Patch('sen/professionals/:id')
  @RequiresPermission('sen.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProfessionalInvolvementSchema))
    dto: UpdateProfessionalInvolvementDto,
  ) {
    return this.senProfessionalService.update(tenant.tenant_id, id, dto);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  // DELETE /v1/sen/professionals/:id
  @Delete('sen/professionals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('sen.manage')
  async delete(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.senProfessionalService.delete(tenant.tenant_id, id);
  }
}
