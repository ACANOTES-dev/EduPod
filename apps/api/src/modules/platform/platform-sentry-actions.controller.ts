import {
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlatformAuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';

import type { JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  assertNoSecrets,
  buildHandoffPrompt,
  redactSecrets,
  suspectedRepoAreasFromEvidence,
} from './platform-ai-action-proposals.service';
import { PlatformAiCopilotService } from './platform-ai-copilot.service';
import { PlatformEvidenceService, type EvidenceItem } from './platform-evidence.service';

@Controller('v1/admin/sentry/issues')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformSentryActionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly copilot: PlatformAiCopilotService,
    private readonly evidence: PlatformEvidenceService,
    private readonly audit: PlatformAuditService,
  ) {}

  // POST /v1/admin/sentry/issues/:id/explain
  @Post(':id/explain')
  @RequiresPlatformPermission('platform.ai.read')
  async explain(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.ensureIssue(id);
    return this.copilot.startConversation({
      context: { id, kind: 'sentry_issue' },
      type: 'diagnostic',
      user_id: user.sub,
    });
  }

  // POST /v1/admin/sentry/issues/:id/generate-handoff
  @Post(':id/generate-handoff')
  @RequiresPlatformPermission('platform.ai.read')
  async generateHandoff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const issue = await this.ensureIssue(id);
    const evidence = await this.evidence.forSentryIssue(id);
    const suspectedRepoAreas = suspectedRepoAreasFromEvidence(evidence.items);
    const title = `Sentry issue ${issue.sentry_issue_id}: ${issue.title}`.slice(0, 200);
    const summary = [
      `State: ${issue.state}`,
      `Level: ${issue.level ?? 'unknown'}`,
      `Environment: ${issue.environment ?? 'unknown'}`,
      `Release: ${issue.release ?? 'unknown'}`,
    ].join('\n');
    const hypothesis = [
      'Investigate the mirrored Sentry issue using the cited platform evidence.',
      'Start with docs/runbooks/agent-sentry-triage.md and verify the issue independently before editing code.',
    ].join(' ');
    const promptMarkdown = redactSecrets(
      buildHandoffPrompt({
        evidence: evidence.items,
        hypothesis,
        suspectedRepoAreas,
        summary,
        title,
      }),
    );
    assertNoSecrets(promptMarkdown);

    const created = await this.prisma.platformAgentHandoffPrompt.create({
      data: {
        created_by_user_id: user.sub,
        evidence: toJson(evidence.items),
        hypothesis,
        prompt_markdown: promptMarkdown,
        summary,
        suspected_repo_areas: suspectedRepoAreas,
        title,
      },
    });
    await this.audit.log({
      ...auditContextFromRequest(user, request),
      action: PlatformAuditAction.sentry_agent_handoff_generated,
      payload: { after: { handoff_id: created.id, issue_id: id } },
      target_resource_id: id,
      target_resource_type: 'platform_sentry_issue',
    });
    return created;
  }

  private async ensureIssue(id: string) {
    const issue = await this.prisma.platformSentryIssue.findUnique({ where: { id } });
    if (!issue) {
      throw new NotFoundException({
        code: 'SENTRY_ISSUE_NOT_FOUND',
        message: `Sentry issue "${id}" not found.`,
      });
    }
    return issue;
  }
}

function toJson(value: EvidenceItem[]): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    ),
  ) as Prisma.InputJsonValue;
}
