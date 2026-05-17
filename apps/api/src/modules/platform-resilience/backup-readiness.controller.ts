import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  backupReadinessListQuerySchema,
  backupReplicationListQuerySchema,
  captureBackupEventSchema,
  createRestoreDrillSchema,
  type BackupReadinessListQuery,
  type BackupReplicationListQuery,
  type CaptureBackupEventDto,
  type CreateRestoreDrillDto,
  type JwtPayload,
  restoreDrillListQuerySchema,
  type RestoreDrillListQuery,
  updateRestoreDrillSchema,
  type UpdateRestoreDrillDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { BackupReadinessService } from './backup-readiness.service';

@Controller('v1/admin/_internal/backup-events')
export class BackupCaptureController {
  constructor(private readonly backups: BackupReadinessService) {}

  // POST /v1/admin/_internal/backup-events
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPlatformPermission('platform.backups.view')
  @SkipPlatformAudit('Internal backup evidence capture is static-token gated and idempotent.')
  async captureBackup(
    @Headers('x-internal-token') token: string | undefined,
    @Body(new ZodValidationPipe(captureBackupEventSchema)) dto: CaptureBackupEventDto,
  ) {
    if (!this.backups.verifyInternalToken(token)) {
      throw new UnauthorizedException({
        code: 'INVALID_INTERNAL_TOKEN',
        message: 'Invalid backup event internal token.',
      });
    }
    return this.backups.capture(dto);
  }
}

@Controller('v1/admin/backups')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class BackupReadinessController {
  constructor(private readonly backups: BackupReadinessService) {}

  // GET /v1/admin/backups/readiness
  @Get('readiness')
  @RequiresPlatformPermission('platform.backups.view')
  async readiness() {
    return this.backups.getReadinessSummary();
  }

  // GET /v1/admin/backups/runs
  @Get('runs')
  @RequiresPlatformPermission('platform.backups.view')
  async runs(
    @Query(new ZodValidationPipe(backupReadinessListQuerySchema))
    query: BackupReadinessListQuery,
  ) {
    return this.backups.listRuns(query);
  }

  // GET /v1/admin/backups/runs/:id
  @Get('runs/:id')
  @RequiresPlatformPermission('platform.backups.view')
  async run(@Param('id', ParseUUIDPipe) id: string) {
    return this.backups.getRun(id);
  }

  // GET /v1/admin/backups/replications
  @Get('replications')
  @RequiresPlatformPermission('platform.backups.view')
  async replications(
    @Query(new ZodValidationPipe(backupReplicationListQuerySchema))
    query: BackupReplicationListQuery,
  ) {
    return this.backups.listReplications(query);
  }

  // GET /v1/admin/backups/restore-drills
  @Get('restore-drills')
  @RequiresPlatformPermission('platform.backups.view')
  async restoreDrills(
    @Query(new ZodValidationPipe(restoreDrillListQuerySchema)) query: RestoreDrillListQuery,
  ) {
    return this.backups.listRestoreDrills(query);
  }

  // POST /v1/admin/backups/restore-drills
  @Post('restore-drills')
  @RequiresPlatformPermission('platform.backups.record_drill')
  async createRestoreDrill(
    @Body(new ZodValidationPipe(createRestoreDrillSchema)) dto: CreateRestoreDrillDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.backups.createRestoreDrill(dto, user.sub, auditContextFromRequest(user, request));
  }

  // PATCH /v1/admin/backups/restore-drills/:id
  @Patch('restore-drills/:id')
  @RequiresPlatformPermission('platform.backups.record_drill')
  async updateRestoreDrill(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('owner_confirmation_id') ownerConfirmationId: string | undefined,
    @Body(new ZodValidationPipe(updateRestoreDrillSchema)) dto: UpdateRestoreDrillDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.backups.updateRestoreDrill(
      id,
      dto,
      auditContextFromRequest(user, request),
      ownerConfirmationId,
    );
  }

  // DELETE /v1/admin/backups/restore-drills/:id
  @Delete('restore-drills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.backups.manage')
  async deleteRestoreDrill(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('owner_confirmation_id') ownerConfirmationId: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    await this.backups.deleteRestoreDrillWithConfirmation(
      id,
      ownerConfirmationId,
      auditContextFromRequest(user, request),
    );
  }
}
