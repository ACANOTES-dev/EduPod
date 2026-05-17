import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface EvidenceItem {
  kind: string;
  id: string;
  link: string;
  occurred_at: string;
  snippet: string;
  raw: unknown;
}

export interface EvidenceBundle {
  items: EvidenceItem[];
}

@Injectable()
export class PlatformEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async forCorrelationId(correlationId: string): Promise<EvidenceBundle> {
    const events = await this.prisma.platformCorrelationEvent.findMany({
      where: { correlation_id: correlationId },
      orderBy: { occurred_at: 'asc' },
      take: 200,
    });
    return {
      items: events.map((event) => ({
        kind: 'correlation_event',
        id: event.id,
        link: `/admin/correlation/${encodeURIComponent(event.correlation_id)}`,
        occurred_at: event.occurred_at.toISOString(),
        snippet: `${event.source}:${event.event_type}`,
        raw: event,
      })),
    };
  }

  async forTimeWindow(
    start: Date,
    end: Date,
    opts?: { tenantId?: string; components?: string[] },
  ): Promise<EvidenceBundle> {
    const [alerts, errors, deploys] = await Promise.all([
      this.prisma.platformAlertHistory.findMany({
        where: { fired_at: { gte: start, lte: end } },
        orderBy: { fired_at: 'desc' },
        take: 50,
      }),
      this.prisma.platformErrorLog.findMany({
        where: {
          last_seen_at: { gte: start, lte: end },
          tenant_id_redacted: opts?.tenantId,
          ...(opts?.components?.length ? { source: { in: opts.components } } : {}),
        },
        orderBy: { last_seen_at: 'desc' },
        take: 50,
      }),
      this.prisma.platformDeployEvent.findMany({
        where: { deployed_at: { gte: start, lte: end } },
        orderBy: { deployed_at: 'desc' },
        take: 20,
      }),
    ]);

    return {
      items: [
        ...alerts.map((alert) => ({
          kind: 'alert',
          id: alert.id,
          link: '/admin/alerts',
          occurred_at: alert.fired_at.toISOString(),
          snippet: `${alert.severity} alert: ${alert.message}`,
          raw: alert,
        })),
        ...errors.map((error) => ({
          kind: 'error_fingerprint',
          id: error.id,
          link: `/admin/errors?fingerprint=${encodeURIComponent(error.fingerprint)}`,
          occurred_at: error.last_seen_at.toISOString(),
          snippet: `${error.level} ${error.fingerprint}: ${error.message_redacted.slice(0, 120)}`,
          raw: error,
        })),
        ...deploys.map((deploy) => ({
          kind: 'deploy_event',
          id: deploy.id,
          link: '/admin/deploys',
          occurred_at: deploy.deployed_at.toISOString(),
          snippet: `${deploy.status} deploy ${deploy.short_sha}`,
          raw: deploy,
        })),
      ],
    };
  }

  async forErrorFingerprint(fingerprint: string): Promise<EvidenceBundle> {
    const errors = await this.prisma.platformErrorLog.findMany({
      where: { fingerprint },
      orderBy: { last_seen_at: 'desc' },
      take: 20,
    });
    return {
      items: errors.map((error) => ({
        kind: 'error_fingerprint',
        id: error.id,
        link: `/admin/errors?fingerprint=${encodeURIComponent(fingerprint)}`,
        occurred_at: error.last_seen_at.toISOString(),
        snippet: error.message_redacted.slice(0, 160),
        raw: error,
      })),
    };
  }

  async forAlert(alertHistoryId: string): Promise<EvidenceBundle> {
    const alert = await this.prisma.platformAlertHistory.findUnique({
      where: { id: alertHistoryId },
      include: { rule: true },
    });
    if (!alert) return { items: [] };
    return {
      items: [
        {
          kind: 'alert',
          id: alert.id,
          link: '/admin/alerts',
          occurred_at: alert.fired_at.toISOString(),
          snippet: `${alert.severity} alert from ${alert.rule.name}`,
          raw: alert,
        },
      ],
    };
  }

  async forTenant(tenantId: string, opts?: { since?: Date }): Promise<EvidenceBundle> {
    const since = opts?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [metrics, errors, audit] = await Promise.all([
      this.prisma.platformTenantMetric.findMany({
        where: { tenant_id: tenantId, snapshot_date: { gte: since } },
        orderBy: { snapshot_date: 'desc' },
        take: 30,
      }),
      this.prisma.platformErrorLog.findMany({
        where: { tenant_id_redacted: tenantId, last_seen_at: { gte: since } },
        orderBy: { last_seen_at: 'desc' },
        take: 30,
      }),
      this.prisma.platformAuditLog.findMany({
        where: { target_tenant_id: tenantId, created_at: { gte: since } },
        orderBy: { created_at: 'desc' },
        take: 30,
      }),
    ]);
    return {
      items: [
        ...metrics.map((metric) => ({
          kind: 'tenant_metric',
          id: metric.id,
          link: `/admin/tenants/${tenantId}`,
          occurred_at: metric.snapshot_date.toISOString(),
          snippet: `Tenant metrics for ${metric.snapshot_date.toISOString().slice(0, 10)}`,
          raw: metric,
        })),
        ...errors.map((error) => ({
          kind: 'error_fingerprint',
          id: error.id,
          link: `/admin/tenants/${tenantId}`,
          occurred_at: error.last_seen_at.toISOString(),
          snippet: error.message_redacted.slice(0, 160),
          raw: error,
        })),
        ...audit.map((entry) => ({
          kind: 'audit_entry',
          id: entry.id,
          link: '/admin/audit-log/platform',
          occurred_at: entry.created_at.toISOString(),
          snippet: `Platform audit action ${entry.action}`,
          raw: entry,
        })),
      ],
    };
  }

  async runbooksForAlert(alertRuleId: string) {
    return this.prisma.platformRunbookIndex.findMany({
      where: { alert_keys: { has: alertRuleId } },
      orderBy: { title: 'asc' },
    });
  }

  async runbooksForError(errorFingerprint: string) {
    return this.prisma.platformRunbookIndex.findMany({
      where: { error_fingerprints: { has: errorFingerprint } },
      orderBy: { title: 'asc' },
    });
  }

  async runbooksForAuditAction(action: string) {
    return this.prisma.platformRunbookIndex.findMany({
      where: { audit_actions: { has: action } },
      orderBy: { title: 'asc' },
    });
  }

  async deploysInWindow(start: Date, end: Date) {
    return this.prisma.platformDeployEvent.findMany({
      where: { deployed_at: { gte: start, lte: end } },
      orderBy: { deployed_at: 'desc' },
    });
  }

  async topologyForEvidence(evidence: EvidenceBundle) {
    const components = new Set<string>();
    for (const item of evidence.items) {
      if (item.kind === 'deploy_event') components.add('api');
      if (item.kind === 'error_fingerprint') components.add('api');
      if (item.kind === 'alert') components.add('bullmq');
    }
    return this.prisma.platformServiceTopology.findMany({
      where: components.size ? { related_components: { hasSome: [...components] } } : {},
      orderBy: { display_name: 'asc' },
    });
  }

  async severityForEvidence(evidence: EvidenceBundle) {
    const hasCriticalAlert = evidence.items.some(
      (item) => item.kind === 'alert' && severityOf(item.raw) === 'critical',
    );
    return this.prisma.platformSeverityPolicy.findMany({
      where: hasCriticalAlert ? { severity: 'critical' } : {},
      orderBy: { title: 'asc' },
    });
  }
}

function severityOf(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || !('severity' in value)) {
    return null;
  }
  const severity = (value as { severity?: unknown }).severity;
  return typeof severity === 'string' ? severity : null;
}
