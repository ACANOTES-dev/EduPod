import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import type { NormalizedSentryIssue, SentryCorrelationResult } from './sentry-types';

@Injectable()
export class SentryCorrelationService {
  constructor(private readonly prisma: PrismaService) {}

  async correlate(issue: NormalizedSentryIssue): Promise<SentryCorrelationResult> {
    const runbookClauses = [
      ...(issue.fingerprint.length ? [{ error_fingerprints: { hasSome: issue.fingerprint } }] : []),
      ...(issue.component ? [{ components: { has: issue.component } }] : []),
    ];
    const [deploy, correlationEvents, runbooks, topology, severity] = await Promise.all([
      this.findDeploy(issue),
      this.findCorrelationEvents(issue),
      this.prisma.platformRunbookIndex.findMany({
        where: runbookClauses.length
          ? { OR: runbookClauses }
          : { id: '__no_sentry_runbook_match__' },
        orderBy: { title: 'asc' },
        take: 12,
      }),
      this.prisma.platformServiceTopology.findMany({
        where: issue.component
          ? {
              OR: [
                { related_components: { has: issue.component } },
                { related_module_keys: { has: issue.component } },
              ],
            }
          : {},
        orderBy: { display_name: 'asc' },
        take: 12,
      }),
      this.prisma.platformSeverityPolicy.findFirst({
        where: issue.level === 'fatal' || issue.level === 'error' ? { severity: 'critical' } : {},
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    return {
      correlated_deploy_id: deploy?.id,
      correlation_ids: union(
        issue.correlation_ids,
        correlationEvents.map((event) => event.correlation_id),
      ),
      related_runbook_keys: runbooks.map((runbook) => runbook.path),
      related_topology_keys: topology.map((entry) => entry.key),
      severity_policy_match: severity?.key,
    };
  }

  private async findDeploy(issue: NormalizedSentryIssue) {
    if (!issue.release) return null;
    const start = new Date(issue.first_seen_at.getTime() - 24 * 60 * 60 * 1000);
    const end = new Date(issue.first_seen_at.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.platformDeployEvent.findFirst({
      where: {
        deployed_at: { gte: start, lte: end },
        OR: [
          { sha: issue.release },
          { short_sha: issue.release.slice(0, 12) },
          { sha: { startsWith: issue.release.slice(0, 7) } },
        ],
      },
      orderBy: { deployed_at: 'desc' },
    });
  }

  private async findCorrelationEvents(issue: NormalizedSentryIssue) {
    const or = [
      ...(issue.correlation_ids.length ? [{ correlation_id: { in: issue.correlation_ids } }] : []),
      ...(issue.tenant_id ? [{ tenant_id: issue.tenant_id }] : []),
    ];
    if (!or.length) return [];
    const start = new Date(issue.first_seen_at.getTime() - 5 * 60 * 1000);
    const end = new Date(issue.last_seen_at.getTime() + 5 * 60 * 1000);
    return this.prisma.platformCorrelationEvent.findMany({
      where: {
        event_type: 'error_captured',
        occurred_at: { gte: start, lte: end },
        OR: or,
      },
      orderBy: { occurred_at: 'desc' },
      take: 20,
    });
  }
}

function union(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming].filter(Boolean))];
}
