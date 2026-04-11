import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import {
  createSavedAudienceSchema,
  previewAudienceSchema,
  updateSavedAudienceSchema,
  type CreateSavedAudienceDto,
  type PreviewAudienceDto,
  type SavedAudienceKind,
  type UpdateSavedAudienceDto,
} from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { AudienceProviderRegistry } from './audience-provider.registry';
import { AudienceResolutionService } from './audience-resolution.service';
import { SavedAudiencesService } from './saved-audiences.service';

/**
 * All endpoints sit behind `inbox.send` — the permission that gates
 * broadcasting. Every staff role that can compose a broadcast can also
 * manage the saved audiences it would send to.
 *
 * Static routes are declared BEFORE `:id` so they don't collide with
 * the UUID pipe on the dynamic segment.
 */
@Controller('v1/inbox/audiences')
@UseGuards(AuthGuard, PermissionGuard)
export class SavedAudiencesController {
  constructor(
    private readonly savedAudiences: SavedAudiencesService,
    private readonly resolution: AudienceResolutionService,
    private readonly registry: AudienceProviderRegistry,
  ) {}

  // GET /v1/inbox/audiences/providers
  @Get('providers')
  @RequiresPermission('inbox.send')
  async listProviders() {
    const providers = this.registry.list().map((p) => ({
      key: p.key,
      display_name: p.displayName,
      wired: p.wired,
    }));
    return { providers };
  }

  // POST /v1/inbox/audiences/preview
  @Post('preview')
  @HttpCode(200)
  @RequiresPermission('inbox.send')
  async preview(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(previewAudienceSchema)) body: PreviewAudienceDto,
  ) {
    return this.resolution.previewCount(tenantContext.tenant_id, body.definition);
  }

  // GET /v1/inbox/audiences
  @Get()
  @RequiresPermission('inbox.send')
  async list(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query('kind') kind?: SavedAudienceKind,
  ) {
    const data = await this.savedAudiences.list(
      tenantContext.tenant_id,
      kind ? { kind } : undefined,
    );
    return { data };
  }

  // POST /v1/inbox/audiences
  @Post()
  @RequiresPermission('inbox.send')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSavedAudienceSchema)) body: CreateSavedAudienceDto,
  ) {
    return this.savedAudiences.create(tenantContext.tenant_id, user.sub, body);
  }

  // GET /v1/inbox/audiences/:id
  @Get(':id')
  @RequiresPermission('inbox.send')
  async get(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedAudiences.get(tenantContext.tenant_id, id);
  }

  // PATCH /v1/inbox/audiences/:id
  @Patch(':id')
  @RequiresPermission('inbox.send')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSavedAudienceSchema)) body: UpdateSavedAudienceDto,
  ) {
    return this.savedAudiences.update(tenantContext.tenant_id, id, body);
  }

  // DELETE /v1/inbox/audiences/:id
  @Delete(':id')
  @HttpCode(204)
  @RequiresPermission('inbox.send')
  async delete(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.savedAudiences.delete(tenantContext.tenant_id, id);
  }

  // GET /v1/inbox/audiences/:id/resolve
  @Get(':id/resolve')
  @RequiresPermission('inbox.send')
  async resolve(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.resolution.resolveSavedAudience(tenantContext.tenant_id, id);
  }
}
