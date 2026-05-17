import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { SentryAlertEmitterService } from './sentry-alert-emitter.service';
import { SentryCorrelationService } from './sentry-correlation.service';
import type { NormalizedSentryIssue } from './sentry-types';

@Injectable()
export class SentryIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly correlation: SentryCorrelationService,
    private readonly alerts: SentryAlertEmitterService,
  ) {}

  async ingest(issue: NormalizedSentryIssue): Promise<{ id: string; sentry_issue_id: string }> {
    const validTenantId = await this.validTenantId(issue.tenant_id);
    const correlation = await this.correlation.correlate(issue);
    const existing = await this.prisma.platformSentryIssue.findUnique({
      where: { sentry_issue_id: issue.sentry_issue_id },
    });
    const data = {
      affected_url: issue.affected_url,
      affected_user_count: BigInt(issue.affected_user_count),
      breadcrumb_summary: issue.breadcrumb_summary
        ? (issue.breadcrumb_summary as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      correlated_deploy_id: correlation.correlated_deploy_id,
      correlation_ids: union(existing?.correlation_ids ?? [], correlation.correlation_ids),
      culprit: issue.culprit,
      environment: issue.environment,
      fingerprint: union(existing?.fingerprint ?? [], issue.fingerprint),
      first_seen_at: minDate(existing?.first_seen_at, issue.first_seen_at),
      last_seen_at: maxDate(existing?.last_seen_at, issue.last_seen_at),
      last_webhook_at: new Date(),
      level: issue.level,
      permalink: issue.permalink,
      related_runbook_keys: correlation.related_runbook_keys,
      related_topology_keys: correlation.related_topology_keys,
      release: issue.release,
      sentry_organization: issue.organization,
      sentry_project: issue.project,
      severity_policy_match: correlation.severity_policy_match,
      stack_summary: issue.stack_summary,
      state: issue.state,
      tags: issue.tags as Prisma.InputJsonValue,
      tenant_id: validTenantId,
      title: issue.title,
      total_event_count: BigInt(issue.total_event_count),
    };
    const mirrored = existing
      ? await this.prisma.platformSentryIssue.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.platformSentryIssue.create({
          data: {
            ...data,
            sentry_issue_id: issue.sentry_issue_id,
          },
        });

    await Promise.all([
      this.recordSummary(mirrored.id, issue, validTenantId),
      this.linkErrorLogs(mirrored.id, issue),
    ]);
    if (issue.state === 'unresolved' && isCritical(issue)) {
      await this.alerts.emit({
        key: 'issue.critical',
        message: `Critical Sentry issue mirrored: ${issue.title}`,
        severity: 'critical',
      });
    }

    return { id: mirrored.id, sentry_issue_id: mirrored.sentry_issue_id };
  }

  private async validTenantId(tenantId: string | undefined): Promise<string | undefined> {
    if (!tenantId) return undefined;
    const tenant = await this.tenantReadFacade.findById(tenantId);
    return tenant?.id;
  }

  private async recordSummary(
    issueId: string,
    issue: NormalizedSentryIssue,
    tenantId: string | undefined,
  ): Promise<void> {
    const hour = new Date(issue.last_seen_at);
    hour.setMinutes(0, 0, 0);
    const existing = await this.prisma.platformSentryEventsSummary.findUnique({
      where: { sentry_issue_id_hour_bucket: { hour_bucket: hour, sentry_issue_id: issueId } },
    });
    if (!existing) {
      await this.prisma.platformSentryEventsSummary.create({
        data: {
          affected_tenant_ids: tenantId ? [tenantId] : [],
          affected_user_count: issue.affected_user_count,
          event_count: BigInt(1),
          hour_bucket: hour,
          sample_event_id: issue.event_id,
          sentry_issue_id: issueId,
        },
      });
      return;
    }
    await this.prisma.platformSentryEventsSummary.update({
      where: { id: existing.id },
      data: {
        affected_tenant_ids: tenantId
          ? union(existing.affected_tenant_ids, [tenantId])
          : existing.affected_tenant_ids,
        affected_user_count: Math.max(existing.affected_user_count, issue.affected_user_count),
        event_count: existing.event_count + BigInt(1),
        sample_event_id: issue.event_id ?? existing.sample_event_id,
      },
    });
  }

  private async linkErrorLogs(issueId: string, issue: NormalizedSentryIssue): Promise<void> {
    const fingerprintMatches = issue.fingerprint.filter((fingerprint) => fingerprint.length <= 64);
    const clauses = [
      ...(issue.event_id ? [{ sentry_event_id: issue.event_id }] : []),
      ...(fingerprintMatches.length ? [{ fingerprint: { in: fingerprintMatches } }] : []),
      ...(issue.correlation_ids.length ? [{ correlation_id: { in: issue.correlation_ids } }] : []),
    ];
    if (!clauses.length) return;
    await this.prisma.platformErrorLog.updateMany({
      where: { OR: clauses },
      data: { sentry_issue_id: issueId },
    });
  }
}

function isCritical(issue: NormalizedSentryIssue): boolean {
  return issue.level === 'fatal' || issue.level === 'error' || issue.tags.severity === 'critical';
}

function union(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming].filter(Boolean))];
}

function minDate(existing: Date | undefined, incoming: Date): Date {
  return existing && existing < incoming ? existing : incoming;
}

function maxDate(existing: Date | undefined, incoming: Date): Date {
  return existing && existing > incoming ? existing : incoming;
}
