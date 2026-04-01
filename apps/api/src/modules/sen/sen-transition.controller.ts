import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, ListTransitionNotesQuery, TenantContext } from '@school/shared';

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
  createTransitionNoteBodySchema,
  type CreateTransitionNoteBody,
} from './dto/create-transition-note.dto';
import { listTransitionNotesQuerySchema } from './dto/list-transition-notes.dto';
import { SenTransitionService } from './sen-transition.service';

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenTransitionController {
  constructor(
    private readonly senTransitionService: SenTransitionService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // GET /v1/sen/transition/handover-pack/:studentId
  @Get('sen/transition/handover-pack/:studentId')
  @RequiresPermission('sen.manage')
  async generateHandoverPack(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senTransitionService.generateHandoverPack(
      tenant.tenant_id,
      user.sub,
      permissions,
      studentId,
    );
  }

  // POST /v1/sen/profiles/:profileId/transition-notes
  @Post('sen/profiles/:profileId/transition-notes')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage')
  async createNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body(new ZodValidationPipe(createTransitionNoteBodySchema)) dto: CreateTransitionNoteBody,
  ) {
    return this.senTransitionService.createNote(tenant.tenant_id, profileId, dto, user.sub);
  }

  // GET /v1/sen/profiles/:profileId/transition-notes
  @Get('sen/profiles/:profileId/transition-notes')
  @RequiresPermission('sen.view')
  async findNotes(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query(new ZodValidationPipe(listTransitionNotesQuerySchema)) query: ListTransitionNotesQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senTransitionService.findNotes(
      tenant.tenant_id,
      user.sub,
      permissions,
      profileId,
      query,
    );
  }

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
