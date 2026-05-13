import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import { createShareableLinkSchema, type CreateShareableLinkDto } from '@school/shared/budgeting';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { ShareableLinksService } from './shareable-links.service';
import type { CreateLinkResponse, ListLinksResponse } from './shareable-links.types';

/**
 * Authenticated CRUD for shareable links nested under a snapshot.
 *
 * Mutations require `budgeting.share`; reads require `budgeting.view`.
 * The public open-route resolver lives on
 * {@link ShareableLinksPublicController}.
 */
@Controller('v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/links')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class ShareableLinksController {
  constructor(private readonly service: ShareableLinksService) {}

  // GET /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/links
  @Get()
  @RequiresPermission('budgeting.view')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ): Promise<ListLinksResponse> {
    return this.service.listForSnapshot(ctx.tenant_id, modelId, snapshotId);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/links
  @Post()
  @RequiresPermission('budgeting.share')
  create(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Body(new ZodValidationPipe(createShareableLinkSchema)) body: CreateShareableLinkDto,
  ): Promise<CreateLinkResponse> {
    return this.service.create(ctx.tenant_id, user.sub, modelId, snapshotId, body);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/links/:linkId/revoke
  @Post(':linkId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('budgeting.share')
  async revoke(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    await this.service.revoke(ctx.tenant_id, user.sub, modelId, snapshotId, linkId);
  }
}
