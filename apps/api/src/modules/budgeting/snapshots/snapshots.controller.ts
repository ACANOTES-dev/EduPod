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

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { listSnapshotsQuerySchema, type ListSnapshotsQueryDto } from './dto/list-snapshots.dto';
import { publishSnapshotSchema, type PublishSnapshotDto } from './dto/publish-snapshot.dto';
import { SnapshotsService } from './snapshots.service';

@Controller('v1/budgeting/financial-models/:modelId/snapshots')
@UseGuards(AuthGuard, PermissionGuard)
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  // GET /v1/budgeting/financial-models/:modelId/snapshots
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Query(new ZodValidationPipe(listSnapshotsQuerySchema)) query: ListSnapshotsQueryDto,
  ) {
    return this.snapshotsService.findAll(tenant.tenant_id, modelId, query);
  }

  // GET /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId
  @Get(':snapshotId')
  @RequiresPermission('budgeting.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ) {
    return this.snapshotsService.findOne(tenant.tenant_id, modelId, snapshotId);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/publish
  @Post('publish')
  @RequiresPermission('budgeting.publish')
  @HttpCode(HttpStatus.CREATED)
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(publishSnapshotSchema)) dto: PublishSnapshotDto,
  ) {
    return this.snapshotsService.publish(tenant.tenant_id, user.sub, modelId, dto);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/restore
  @Post(':snapshotId/restore')
  @RequiresPermission('budgeting.publish')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ) {
    return this.snapshotsService.restore(tenant.tenant_id, user.sub, modelId, snapshotId);
  }
}
