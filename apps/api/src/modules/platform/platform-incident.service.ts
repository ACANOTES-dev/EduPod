import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PlatformIncidentStatus,
  PlatformIncidentTimelineEventType,
  Prisma,
  type PlatformAlertHistory,
  type PlatformAlertRule,
  type PlatformIncident,
} from '@prisma/client';

import type {
  CreatePlatformIncidentTimelineEventDto,
  ListPlatformIncidentsQuery,
  UpdatePlatformIncidentDto,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

const RELATED_ALERT_WINDOW_MS = 30 * 60 * 1000;
const MONITORING_QUIET_PERIOD_MS = 60 * 60 * 1000;

type AlertWithRule = PlatformAlertHistory & { rule: PlatformAlertRule };

type AlertRelationKey = {
  component: string | null;
  queue: string | null;
  tenantId: string | null;
};

@Injectable()
export class PlatformIncidentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPlatformIncidentsQuery): Promise<{
    data: PlatformIncident[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.PlatformIncidentWhereInput = {
      severity: query.severity,
      status: query.status,
      started_at: {
        gte: query.from,
        lte: query.to,
      },
    };
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformIncident.findMany({
        where,
        orderBy: { started_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformIncident.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string) {
    const incident = await this.prisma.platformIncident.findUnique({
      where: { id },
      include: {
        alerts: { include: { rule: true }, orderBy: { fired_at: 'asc' } },
        handoffs: { orderBy: { created_at: 'desc' } },
        timeline: { orderBy: { occurred_at: 'asc' } },
      },
    });
    if (!incident) {
      throw new NotFoundException({
        code: 'PLATFORM_INCIDENT_NOT_FOUND',
        message: `Platform incident "${id}" not found.`,
      });
    }
    const recommendations =
      incident.prevention_recommendation_ids.length > 0
        ? await this.prisma.platformAiRecommendation.findMany({
            where: { id: { in: incident.prevention_recommendation_ids } },
            orderBy: { generated_at: 'desc' },
          })
        : [];
    return { ...incident, prevention_recommendations: recommendations };
  }

  async update(
    id: string,
    dto: UpdatePlatformIncidentDto,
    userId: string,
  ): Promise<PlatformIncident> {
    const existing = await this.prisma.platformIncident.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'PLATFORM_INCIDENT_NOT_FOUND',
        message: `Platform incident "${id}" not found.`,
      });
    }

    const now = new Date();
    const update: Prisma.PlatformIncidentUpdateInput = {
      affected_components: dto.affected_components,
      affected_tenants: dto.affected_tenants,
      title: dto.title,
    };
    if (dto.status) {
      update.status = dto.status;
      if (dto.status === PlatformIncidentStatus.resolved) {
        update.resolved_at = existing.resolved_at ?? now;
        update.resolved_by = { connect: { id: userId } };
        update.auto_resolved = false;
      }
      if (
        dto.status === PlatformIncidentStatus.active ||
        dto.status === PlatformIncidentStatus.monitoring
      ) {
        update.resolved_at = null;
        update.resolved_by = { disconnect: true };
        update.auto_resolved = false;
      }
    }

    const updated = await this.prisma.platformIncident.update({ where: { id }, data: update });
    if (dto.status && dto.status !== existing.status) {
      await this.addTimelineEvent(id, {
        description: `Incident status changed from ${existing.status} to ${dto.status}.`,
        eventType: 'status_changed',
        occurredAt: now,
      });
    }
    return updated;
  }

  async addOperatorNote(id: string, dto: CreatePlatformIncidentTimelineEventDto) {
    await this.assertExists(id);
    return this.addTimelineEvent(id, {
      description: dto.description,
      eventType: 'operator_note',
      occurredAt: new Date(),
    });
  }

  async saveFinalPostmortem(id: string, markdown: string): Promise<PlatformIncident> {
    await this.assertExists(id);
    return this.prisma.platformIncident.update({
      where: { id },
      data: { postmortem_final: markdown },
    });
  }

  async createOrAttachFromAlert(alertId: string): Promise<PlatformIncident | null> {
    const alert = await this.prisma.platformAlertHistory.findUnique({
      where: { id: alertId },
      include: { rule: true },
    });
    if (!alert || alert.suppressed_by_silence_id || alert.suppressed_by_maintenance_window_id) {
      return null;
    }
    if (alert.incident_id) {
      return this.prisma.platformIncident.findUnique({ where: { id: alert.incident_id } });
    }

    const related = await this.findRelatedOpenIncident(alert);
    if (related) {
      await this.attachAlert(related, alert, 'related_alert_attached');
      return related;
    }

    if (alert.severity !== 'critical') {
      return null;
    }

    const relation = relationKeyFor(alert);
    const created = await this.prisma.platformIncident.create({
      data: {
        affected_components: relation.component ? [relation.component] : [],
        affected_tenants: relation.tenantId ? [relation.tenantId] : [],
        seed_alert_history_id: alert.id,
        severity: 'critical',
        started_at: alert.fired_at,
        title: titleForAlert(alert),
      },
    });
    await this.attachAlert(created, alert, 'alert_fired');
    return created;
  }

  async recordAlertAcknowledged(alertId: string, occurredAt: Date): Promise<void> {
    const alert = await this.prisma.platformAlertHistory.findUnique({ where: { id: alertId } });
    if (!alert?.incident_id) return;
    await this.addTimelineEvent(alert.incident_id, {
      alertHistoryId: alert.id,
      description: `Alert acknowledged: ${alert.message}`,
      eventType: 'alert_acknowledged',
      occurredAt,
    });
  }

  async recordAlertResolved(alertId: string, occurredAt: Date): Promise<void> {
    const alert = await this.prisma.platformAlertHistory.findUnique({ where: { id: alertId } });
    if (!alert?.incident_id) return;
    await this.addTimelineEvent(alert.incident_id, {
      alertHistoryId: alert.id,
      description: `Alert resolved: ${alert.message}`,
      eventType: 'alert_resolved',
      occurredAt,
    });
    await this.moveToMonitoringIfAllAlertsResolved(alert.incident_id, occurredAt);
  }

  async autoResolveMonitoringIncidents(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - MONITORING_QUIET_PERIOD_MS);
    const incidents = await this.prisma.platformIncident.findMany({
      where: { status: 'monitoring', resolved_at: { lte: cutoff } },
      include: { alerts: true },
      take: 100,
    });
    let resolved = 0;
    for (const incident of incidents) {
      const hasRecentAlert = incident.alerts.some((alert) => alert.fired_at > cutoff);
      const hasOpenAlert = incident.alerts.some((alert) => alert.status !== 'resolved');
      if (hasRecentAlert || hasOpenAlert) continue;
      await this.prisma.platformIncident.update({
        where: { id: incident.id },
        data: { auto_resolved: true, resolved_at: now, status: 'resolved' },
      });
      await this.addTimelineEvent(incident.id, {
        description:
          'Incident auto-resolved after all contributing alerts stayed quiet for 1 hour.',
        eventType: 'status_changed',
        occurredAt: now,
      });
      resolved += 1;
    }
    return resolved;
  }

  async linkPreventionRecommendations(
    incidentId: string,
    recommendationIds: string[],
  ): Promise<PlatformIncident> {
    const incident = await this.prisma.platformIncident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException({
        code: 'PLATFORM_INCIDENT_NOT_FOUND',
        message: `Platform incident "${incidentId}" not found.`,
      });
    }
    const nextIds = [...new Set([...incident.prevention_recommendation_ids, ...recommendationIds])];
    const updated = await this.prisma.platformIncident.update({
      where: { id: incidentId },
      data: { prevention_recommendation_ids: nextIds },
    });
    for (const recommendationId of recommendationIds) {
      await this.addTimelineEvent(incidentId, {
        description: `Prevention recommendation generated: ${recommendationId}`,
        eventType: 'ai_recommendation_generated',
        occurredAt: new Date(),
        metadata: { recommendation_id: recommendationId },
      });
    }
    return updated;
  }

  private async findRelatedOpenIncident(alert: AlertWithRule): Promise<PlatformIncident | null> {
    const relation = relationKeyFor(alert);
    const since = new Date(alert.fired_at.getTime() - RELATED_ALERT_WINDOW_MS);
    const candidates = await this.prisma.platformIncident.findMany({
      where: {
        status: { in: ['active', 'monitoring'] },
        started_at: { gte: since },
      },
      include: { alerts: { include: { rule: true } } },
      orderBy: { started_at: 'desc' },
      take: 20,
    });
    return (
      candidates.find((incident) =>
        incident.alerts.some((existingAlert) =>
          alertsAreRelated(relation, relationKeyFor(existingAlert)),
        ),
      ) ?? null
    );
  }

  private async attachAlert(
    incident: PlatformIncident,
    alert: AlertWithRule,
    eventType: 'alert_fired' | 'related_alert_attached',
  ): Promise<void> {
    const relation = relationKeyFor(alert);
    await this.prisma.platformAlertHistory.update({
      where: { id: alert.id },
      data: { incident_id: incident.id },
    });
    await this.prisma.platformIncident.update({
      where: { id: incident.id },
      data: {
        affected_components: relation.component
          ? [...new Set([...incident.affected_components, relation.component])]
          : incident.affected_components,
        affected_tenants: relation.tenantId
          ? [...new Set([...incident.affected_tenants, relation.tenantId])]
          : incident.affected_tenants,
        status: incident.status === 'monitoring' ? 'active' : incident.status,
      },
    });
    await this.addTimelineEvent(incident.id, {
      alertHistoryId: alert.id,
      description:
        eventType === 'alert_fired'
          ? `Seed alert fired: ${alert.message}`
          : `Related alert attached: ${alert.message}`,
      eventType,
      occurredAt: alert.fired_at,
      metadata: { rule_id: alert.rule_id },
    });
  }

  private async moveToMonitoringIfAllAlertsResolved(
    incidentId: string,
    occurredAt: Date,
  ): Promise<void> {
    const incident = await this.prisma.platformIncident.findUnique({
      where: { id: incidentId },
      include: { alerts: true },
    });
    if (!incident || incident.status === 'resolved' || incident.status === 'cancelled') return;
    if (incident.alerts.some((alert) => alert.status !== 'resolved')) return;

    await this.prisma.platformIncident.update({
      where: { id: incidentId },
      data: { resolved_at: occurredAt, status: 'monitoring' },
    });
    await this.addTimelineEvent(incidentId, {
      description: 'All contributing alerts resolved; incident moved to monitoring.',
      eventType: 'status_changed',
      occurredAt,
    });
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.platformIncident.count({ where: { id } });
    if (exists === 0) {
      throw new NotFoundException({
        code: 'PLATFORM_INCIDENT_NOT_FOUND',
        message: `Platform incident "${id}" not found.`,
      });
    }
  }

  private async addTimelineEvent(
    incidentId: string,
    input: {
      alertHistoryId?: string;
      description: string;
      eventType: keyof typeof PlatformIncidentTimelineEventType;
      metadata?: Record<string, unknown>;
      occurredAt: Date;
    },
  ) {
    return this.prisma.platformIncidentTimelineEvent.create({
      data: {
        alert_history_id: input.alertHistoryId,
        description: input.description,
        event_type: input.eventType,
        incident_id: incidentId,
        metadata: input.metadata ? toJson(input.metadata) : undefined,
        occurred_at: input.occurredAt,
      },
    });
  }
}

function relationKeyFor(alert: AlertWithRule): AlertRelationKey {
  const config = parseConditionConfig(alert.rule.condition_config);
  return {
    component: config.component ?? componentFromMetric(alert.rule.metric),
    queue: config.queue ?? null,
    tenantId: config.tenant_id ?? null,
  };
}

function alertsAreRelated(left: AlertRelationKey, right: AlertRelationKey): boolean {
  if (left.tenantId && right.tenantId && left.tenantId !== right.tenantId) return false;
  if (left.queue && right.queue) return left.queue === right.queue;
  if (left.component && right.component) return left.component === right.component;
  return false;
}

function parseConditionConfig(value: Prisma.JsonValue): {
  component?: string;
  queue?: string;
  tenant_id?: string;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    component: typeof record.component === 'string' ? record.component : undefined,
    queue: typeof record.queue === 'string' ? record.queue : undefined,
    tenant_id: typeof record.tenant_id === 'string' ? record.tenant_id : undefined,
  };
}

function componentFromMetric(metric: string): string | null {
  if (metric.includes('queue') || metric.includes('stuck_jobs') || metric.includes('bullmq')) {
    return 'bullmq';
  }
  if (metric.includes('disk')) return 'disk';
  if (metric.includes('error') || metric.includes('api')) return 'api';
  return null;
}

function titleForAlert(alert: AlertWithRule): string {
  const relation = relationKeyFor(alert);
  const suffix = relation.queue ?? relation.component ?? alert.rule.metric;
  return `${alert.rule.name} (${suffix})`.slice(0, 200);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
