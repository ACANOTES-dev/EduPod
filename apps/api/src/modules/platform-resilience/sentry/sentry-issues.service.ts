import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { SentryIssueListQuery, SentryWebhookAuditQuery } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

const SOURCE_TEMPLATE_PATH = join(
  process.cwd(),
  'src/modules/platform-resilience/sentry/templates/sentry-triage-prompt.template.md',
);
const REPO_TEMPLATE_PATH = join(
  process.cwd(),
  'apps/api/src/modules/platform-resilience/sentry/templates/sentry-triage-prompt.template.md',
);

@Injectable()
export class SentryIssuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SentryIssueListQuery) {
    const where = this.where(query);
    const [rows, total] = await Promise.all([
      this.prisma.platformSentryIssue.findMany({
        where,
        orderBy: { last_seen_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.platformSentryIssue.count({ where }),
    ]);
    return {
      data: rows.map(serializeIssue),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string) {
    const issue = await this.prisma.platformSentryIssue.findUnique({
      where: { id },
      include: {
        correlated_deploy: true,
        error_logs: { orderBy: { last_seen_at: 'desc' }, take: 25 },
        events_summary: { orderBy: { hour_bucket: 'asc' }, take: 168 },
      },
    });
    if (!issue) {
      throw new NotFoundException({
        code: 'SENTRY_ISSUE_NOT_FOUND',
        message: `Sentry issue "${id}" not found.`,
      });
    }
    return {
      ...serializeIssue(issue),
      correlated_deploy: issue.correlated_deploy,
      error_logs: issue.error_logs,
      events_summary: issue.events_summary.map((entry) => ({
        ...entry,
        event_count: Number(entry.event_count),
      })),
    };
  }

  async audit(query: SentryWebhookAuditQuery) {
    const where =
      query.signature_valid === undefined ? {} : { signature_valid: query.signature_valid };
    const [rows, total] = await Promise.all([
      this.prisma.platformSentryWebhookAudit.findMany({
        where,
        orderBy: { received_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.platformSentryWebhookAudit.count({ where }),
    ]);
    return {
      data: rows,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async preparePrompt(id: string) {
    const issue = await this.get(id);
    const template = readFileSync(
      existsSync(SOURCE_TEMPLATE_PATH) ? SOURCE_TEMPLATE_PATH : REPO_TEMPLATE_PATH,
      'utf8',
    );
    return {
      prompt_markdown: render(template, {
        correlated_deploy_id: issue.correlated_deploy_id ?? 'none',
        correlation_ids: issue.correlation_ids.join(', ') || 'none',
        environment: issue.environment ?? 'unknown',
        first_seen_at: issue.first_seen_at.toISOString(),
        level: issue.level ?? 'unknown',
        linked_error_log_ids: issue.error_logs.map((entry) => entry.id).join(', ') || 'none',
        local_issue_id: issue.id,
        permalink: issue.permalink || 'none',
        related_runbook_keys: issue.related_runbook_keys.join(', ') || 'none',
        related_topology_keys: issue.related_topology_keys.join(', ') || 'none',
        release: issue.release ?? 'unknown',
        sentry_issue_id: issue.sentry_issue_id,
        sentry_project: issue.sentry_project,
        severity_policy_match: issue.severity_policy_match ?? 'none',
        stack_summary: issue.stack_summary ?? 'No stack summary mirrored.',
        state: issue.state,
        tags_json: JSON.stringify(issue.tags, null, 2),
        title: issue.title,
        last_seen_at: issue.last_seen_at.toISOString(),
      }),
    };
  }

  private where(query: SentryIssueListQuery): Prisma.PlatformSentryIssueWhereInput {
    return {
      environment: query.environment,
      release: query.release,
      state: query.state,
      tenant_id: query.tenant_id,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { sentry_issue_id: { contains: query.q, mode: 'insensitive' } },
              { culprit: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }
}

function serializeIssue<T extends { affected_user_count: bigint; total_event_count: bigint }>(
  issue: T,
) {
  return {
    ...issue,
    affected_user_count: Number(issue.affected_user_count),
    total_event_count: Number(issue.total_event_count),
  };
}

function render(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}
