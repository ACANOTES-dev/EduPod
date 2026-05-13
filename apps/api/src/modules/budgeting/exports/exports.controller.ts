import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';

import { ExportsService } from './exports.service';

@Controller('v1/budgeting/financial-models/:id/snapshots/:snapshotId/exports')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  // GET …/exports/pdf  → 302 to signed URL when rendered, 202 otherwise.
  @Get('pdf')
  @RequiresPermission('budgeting.view')
  async getPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportsService.serveSnapshotArtifact(
      tenant.tenant_id,
      modelId,
      snapshotId,
      'pdf',
    );
    if (result.status === 'rendered' && result.signed_url) {
      res.redirect(HttpStatus.FOUND, result.signed_url);
      return;
    }
    res.status(HttpStatus.ACCEPTED).json({
      status: 'rendering',
      job_id: result.job_id,
      message: 'Board pack is rendering. Try again in a few seconds.',
    });
  }

  // GET …/exports/excel  → 302 to signed URL when rendered, 202 otherwise.
  @Get('excel')
  @RequiresPermission('budgeting.view')
  async getExcel(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportsService.serveSnapshotArtifact(
      tenant.tenant_id,
      modelId,
      snapshotId,
      'excel',
    );
    if (result.status === 'rendered' && result.signed_url) {
      res.redirect(HttpStatus.FOUND, result.signed_url);
      return;
    }
    res.status(HttpStatus.ACCEPTED).json({
      status: 'rendering',
      job_id: result.job_id,
      message: 'Excel export is rendering. Try again in a few seconds.',
    });
  }

  // POST …/exports/regenerate  → enqueues both PDF + Excel re-renders.
  @Post('regenerate')
  @RequiresPermission('budgeting.publish')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ): Promise<{ job_id: string; status: 'enqueued' }> {
    const job_id = await this.exportsService.enqueueBoardPackRender(
      tenant.tenant_id,
      modelId,
      snapshotId,
      'all',
    );
    return { job_id, status: 'enqueued' };
  }
}
