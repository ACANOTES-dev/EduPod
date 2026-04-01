import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { AiAuditService } from './ai-audit.service';

// ─── Right-to-Explanation response shape (Article 22) ─────────────────────────

interface AiExplanationResponse {
  decision: {
    type: string;
    subject_type: string | null;
    subject_id: string | null;
    date: Date;
  };
  ai_input: {
    data_categories: string[];
    tokenised: boolean;
    note: string | null;
  };
  ai_output: {
    summary: string | null;
    model: string | null;
    confidence: number | null;
    processing_time_ms: number | null;
  };
  human_review: {
    reviewed: boolean;
    accepted: boolean | null;
    reviewed_by_user_id: string | null;
    reviewed_at: Date | null;
    rejected_reason?: string | null;
  };
}

// ─── Decision body shape ──────────────────────────────────────────────────────

interface RecordDecisionBody {
  output_used: boolean;
  rejected_reason?: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/ai-audit')
@UseGuards(AuthGuard, PermissionGuard)
export class AiAuditController {
  constructor(private readonly aiAuditService: AiAuditService) {}

  // GET /v1/ai-audit/stats
  @Get('stats')
  @RequiresPermission('gdpr.view')
  async getStats(
    @CurrentTenant() tenant: TenantContext,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.aiAuditService.getStats(tenant.tenant_id, dateFrom, dateTo);
  }

  // GET /v1/ai-audit/subject/:type/:id
  @Get('subject/:type/:id')
  @RequiresPermission('gdpr.view')
  async getSubjectLogs(
    @CurrentTenant() tenant: TenantContext,
    @Param('type') subjectType: string,
    @Param('id', ParseUUIDPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
  ) {
    return this.aiAuditService.getLogsForSubject(
      tenant.tenant_id,
      subjectType,
      subjectId,
      page,
      pageSize,
    );
  }

  // GET /v1/ai-audit/service/:service
  @Get('service/:service')
  @RequiresPermission('gdpr.view')
  async getServiceLogs(
    @CurrentTenant() tenant: TenantContext,
    @Param('service') service: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
  ) {
    return this.aiAuditService.getLogsByService(tenant.tenant_id, service, page, pageSize);
  }

  // GET /v1/ai-audit/:id
  @Get(':id')
  @RequiresPermission('gdpr.view')
  async getLogDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiExplanationResponse> {
    const log = await this.aiAuditService.getLogById(tenant.tenant_id, id);

    if (!log) {
      throw new NotFoundException(
        apiError('AI_LOG_NOT_FOUND', `AI processing log "${id}" not found`),
      );
    }

    return {
      decision: {
        type: log.ai_service,
        subject_type: log.subject_type,
        subject_id: log.subject_id,
        date: log.created_at,
      },
      ai_input: {
        data_categories: log.input_data_categories,
        tokenised: log.tokenised,
        note: log.tokenised ? 'Student identifiers were anonymised before processing' : null,
      },
      ai_output: {
        summary: log.response_summary,
        model: log.model_used,
        confidence: log.confidence_score !== null ? Number(log.confidence_score) : null,
        processing_time_ms: log.processing_time_ms,
      },
      human_review: {
        reviewed: log.output_used !== null,
        accepted: log.output_used,
        reviewed_by_user_id: log.accepted_by_user_id,
        reviewed_at: log.accepted_at,
        ...(log.rejected_reason !== null && log.rejected_reason !== undefined
          ? { rejected_reason: log.rejected_reason }
          : {}),
      },
    };
  }

  // PATCH /v1/ai-audit/:id/decision
  @Patch(':id/decision')
  @RequiresPermission('gdpr.view')
  async recordDecision(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordDecisionBody,
  ) {
    await this.aiAuditService.recordDecision(tenant.tenant_id, id, {
      outputUsed: body.output_used,
      acceptedByUserId: user.sub,
      acceptedAt: new Date(),
      rejectedReason: body.rejected_reason ?? null,
    });

    return { success: true };
  }
}
