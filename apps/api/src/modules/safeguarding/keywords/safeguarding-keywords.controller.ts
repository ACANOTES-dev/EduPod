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
  UseGuards,
} from '@nestjs/common';

import {
  bulkImportSafeguardingKeywordsSchema,
  createSafeguardingKeywordSchema,
  setSafeguardingKeywordActiveSchema,
  updateSafeguardingKeywordSchema,
  type BulkImportSafeguardingKeywordsDto,
  type CreateSafeguardingKeywordDto,
  type SetSafeguardingKeywordActiveDto,
  type UpdateSafeguardingKeywordDto,
} from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AdminTierOnlyGuard } from '../../inbox/common/admin-tier-only.guard';

import { SafeguardingKeywordsService } from './safeguarding-keywords.service';

/**
 * Keyword management surface. Every endpoint is gated by both
 * `safeguarding.keywords.write` AND the `AdminTierOnlyGuard` so only the
 * Owner / Principal / Vice Principal can read or change the list — the
 * keyword set is privileged and must not leak to teachers or parents.
 */
@Controller('v1/safeguarding/keywords')
@UseGuards(AuthGuard, PermissionGuard, AdminTierOnlyGuard)
export class SafeguardingKeywordsController {
  constructor(private readonly keywords: SafeguardingKeywordsService) {}

  // GET /v1/safeguarding/keywords
  @Get()
  @RequiresPermission('safeguarding.keywords.write')
  async list(@CurrentTenant() tenantContext: { tenant_id: string }) {
    const data = await this.keywords.list(tenantContext.tenant_id);
    return { data };
  }

  // POST /v1/safeguarding/keywords
  @Post()
  @RequiresPermission('safeguarding.keywords.write')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createSafeguardingKeywordSchema))
    body: CreateSafeguardingKeywordDto,
  ) {
    return this.keywords.create(tenantContext.tenant_id, body);
  }

  // POST /v1/safeguarding/keywords/bulk-import
  @Post('bulk-import')
  @HttpCode(200)
  @RequiresPermission('safeguarding.keywords.write')
  async bulkImport(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkImportSafeguardingKeywordsSchema))
    body: BulkImportSafeguardingKeywordsDto,
  ) {
    return this.keywords.bulkImport(tenantContext.tenant_id, body.keywords);
  }

  // PATCH /v1/safeguarding/keywords/:id
  @Patch(':id')
  @RequiresPermission('safeguarding.keywords.write')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSafeguardingKeywordSchema))
    body: UpdateSafeguardingKeywordDto,
  ) {
    return this.keywords.update(tenantContext.tenant_id, id, body);
  }

  // PATCH /v1/safeguarding/keywords/:id/active
  @Patch(':id/active')
  @HttpCode(204)
  @RequiresPermission('safeguarding.keywords.write')
  async setActive(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setSafeguardingKeywordActiveSchema))
    body: SetSafeguardingKeywordActiveDto,
  ): Promise<void> {
    await this.keywords.setActive(tenantContext.tenant_id, id, body.active);
  }

  // DELETE /v1/safeguarding/keywords/:id
  @Delete(':id')
  @HttpCode(204)
  @RequiresPermission('safeguarding.keywords.write')
  async delete(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.keywords.delete(tenantContext.tenant_id, id);
  }
}
