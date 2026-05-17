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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createEvidencePipelineSchema,
  type CreateEvidencePipelineDto,
  evidencePipelineListQuerySchema,
  type EvidencePipelineListQuery,
  type JwtPayload,
  updateEvidencePipelineSchema,
  type UpdateEvidencePipelineDto,
  uptimeReconciliationListQuerySchema,
  type UptimeReconciliationListQuery,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { EvidenceFreshnessService } from './evidence-freshness.service';
import { UptimeReconciliationService } from './uptime-reconciliation.service';

@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class EvidenceCompletenessController {
  constructor(
    private readonly freshness: EvidenceFreshnessService,
    private readonly audit: PlatformAuditService,
    private readonly uptimeReconciliation: UptimeReconciliationService,
  ) {}

  // GET /v1/admin/evidence-pipelines
  @Get('evidence-pipelines')
  @RequiresPlatformPermission('platform.evidence.view')
  async listPipelines(
    @Query(new ZodValidationPipe(evidencePipelineListQuerySchema))
    query: EvidencePipelineListQuery,
  ) {
    return this.freshness.list(query);
  }

  // POST /v1/admin/evidence-pipelines
  @Post('evidence-pipelines')
  @RequiresPlatformPermission('platform.evidence.manage')
  async createPipeline(
    @Body(new ZodValidationPipe(createEvidencePipelineSchema)) dto: CreateEvidencePipelineDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.freshness.create(dto, auditContextFromRequest(user, request));
  }

  // GET /v1/admin/evidence-pipelines/:key
  @Get('evidence-pipelines/:key')
  @RequiresPlatformPermission('platform.evidence.view')
  async getPipeline(@Param('key') key: string) {
    return this.freshness.get(key);
  }

  // PATCH /v1/admin/evidence-pipelines/:id
  @Patch('evidence-pipelines/:id')
  @RequiresPlatformPermission('platform.evidence.manage')
  async updatePipeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEvidencePipelineSchema)) dto: UpdateEvidencePipelineDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.freshness.update(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/evidence-pipelines/:id
  @Delete('evidence-pipelines/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.evidence.manage')
  async deletePipeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    await this.freshness.remove(id, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/evidence-pipelines/:key/run-check-now
  @Post('evidence-pipelines/:key/run-check-now')
  @RequiresPlatformPermission('platform.evidence.run')
  async runPipelineCheck(
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.freshness.checkOne(key, {
      audit: auditContextFromRequest(user, request),
      triggered_by_user_id: user.sub,
    });
  }

  // GET /v1/admin/uptime-reconciliations
  @Get('uptime-reconciliations')
  @RequiresPlatformPermission('platform.evidence.view')
  async listReconciliations(
    @Query(new ZodValidationPipe(uptimeReconciliationListQuerySchema))
    query: UptimeReconciliationListQuery,
  ) {
    return this.uptimeReconciliation.listDisagreements(query);
  }

  // POST /v1/admin/uptime-reconciliations/:id/acknowledge
  @Post('uptime-reconciliations/:id/acknowledge')
  @RequiresPlatformPermission('platform.evidence.manage')
  async acknowledgeReconciliation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const updated = await this.uptimeReconciliation.acknowledge({ id, user_id: user.sub });
    await this.audit.log({
      ...auditContextFromRequest(user, request),
      action: 'uptime_reconciliation_acknowledged',
      payload: { after: updated },
      target_resource_id: id,
      target_resource_type: 'uptime_reconciliation',
    });
    return updated;
  }

  // GET /v1/admin/copilot/freshness-summary
  @Get('copilot/freshness-summary')
  @RequiresPlatformPermission('platform.evidence.view')
  @SkipPlatformAudit('Read-only freshness summary for the Copilot banner; no model call.')
  async copilotFreshnessSummary() {
    return this.freshness.freshnessSummary();
  }
}
