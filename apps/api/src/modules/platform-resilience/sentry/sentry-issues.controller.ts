import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformAuditAction } from '@prisma/client';
import type { Request } from 'express';

import {
  type JwtPayload,
  type SentryIssueListQuery,
  sentryIssueListQuerySchema,
  type SentryWebhookAuditQuery,
  sentryWebhookAuditQuerySchema,
} from '@school/shared';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../../platform-audit/audit-request-context';
import { PlatformAuditService } from '../../platform-audit/platform-audit.service';

import { SentryIssuesService } from './sentry-issues.service';

@Controller('v1/admin/sentry')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class SentryIssuesController {
  constructor(
    private readonly sentryIssues: SentryIssuesService,
    private readonly audit: PlatformAuditService,
  ) {}

  // GET /v1/admin/sentry/issues
  @Get('issues')
  @RequiresPlatformPermission('platform.sentry.view')
  async list(
    @Query(new ZodValidationPipe(sentryIssueListQuerySchema)) query: SentryIssueListQuery,
  ) {
    return this.sentryIssues.list(query);
  }

  // GET /v1/admin/sentry/issues/:id
  @Get('issues/:id')
  @RequiresPlatformPermission('platform.sentry.view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sentryIssues.get(id);
  }

  // POST /v1/admin/sentry/issues/:id/prepare-triage-prompt
  @Post('issues/:id/prepare-triage-prompt')
  @RequiresPlatformPermission('platform.sentry.triage')
  async preparePrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const prepared = await this.sentryIssues.preparePrompt(id);
    await this.audit.log({
      ...auditContextFromRequest(user, request),
      action: PlatformAuditAction.sentry_triage_prompt_prepared,
      payload: { after: { issue_id: id } },
      target_resource_id: id,
      target_resource_type: 'platform_sentry_issue',
    });
    return prepared;
  }

  // GET /v1/admin/sentry/webhook-audit
  @Get('webhook-audit')
  @RequiresPlatformPermission('platform.sentry.view')
  async auditRows(
    @Query(new ZodValidationPipe(sentryWebhookAuditQuerySchema))
    query: SentryWebhookAuditQuery,
  ) {
    return this.sentryIssues.audit(query);
  }
}
