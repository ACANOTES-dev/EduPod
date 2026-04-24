import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';
import { upsertSavedReportDraftSchema } from '@school/shared/reports';
import type { UpsertSavedReportDraftDto } from '@school/shared/reports';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { SavedReportDraftService } from './saved-report-draft.service';

/**
 * Draft CRUD for the custom report builder. Owned per (tenant_id, user_id).
 *
 * - `GET` returns the caller's current draft, or HTTP 204 if none.
 * - `PUT` upserts the draft. Debounced client-side (~500ms) during
 *   builder editing.
 * - `DELETE` clears the draft. Fired when the builder saves formally or
 *   when the user abandons a session with the "discard draft" action.
 */
@Controller('v1/reports/builder/draft')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('reports.builder', 'analytics.manage_reports')
export class SavedReportDraftController {
  constructor(private readonly service: SavedReportDraftService) {}

  @Get()
  async get(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const draft = await this.service.get(tenant.tenant_id, user.sub);
    if (!draft) {
      res.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return draft;
  }

  @Put()
  async upsert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertSavedReportDraftSchema)) body: UpsertSavedReportDraftDto,
  ) {
    return this.service.upsert(tenant.tenant_id, user.sub, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    await this.service.clear(tenant.tenant_id, user.sub);
  }
}
