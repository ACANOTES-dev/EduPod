import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type PlatformAlertHistory,
  type PlatformAlertRoute,
  type PlatformAlertRule,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AlertAckTokenService } from './alert-ack-token.service';
import { AlertDispatchService } from './alert-dispatch.service';
import { AlertRoutesService } from './alert-routes.service';
import {
  alertEscalationStepsStoredSchema,
  type AlertEscalationStepStored,
} from './alert-routing.types';
import { ChannelDispatchService } from './channel-dispatch.service';
import type { AlertPayload } from './dispatchers/channel-dispatcher.interface';
import { PlatformIncidentService } from './platform-incident.service';
import { isSuppressedByQuietHours } from './quiet-hours-evaluator';
import { RedisPubSubService } from './redis-pubsub.service';

@Injectable()
export class AlertRoutingService {
  private readonly logger = new Logger(AlertRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelDispatch: ChannelDispatchService,
    private readonly legacyDispatch: AlertDispatchService,
    private readonly routesService: AlertRoutesService,
    private readonly ackTokens: AlertAckTokenService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly platformIncidentService: PlatformIncidentService,
  ) {}

  async dispatchInitial(
    alertHistoryId: string,
    excludeRouteIds = new Set<string>(),
  ): Promise<string[]> {
    const alert = await this.findAlert(alertHistoryId);
    const policy = await this.findPolicy(alert);
    if (!policy) {
      return this.dispatchFallback(alert);
    }

    const steps = alertEscalationStepsStoredSchema.parse(policy.steps);
    if (steps.length === 0) {
      return this.dispatchFallback(alert);
    }

    const dispatched = await this.dispatchFirstAvailableStep(alert, steps, 0, excludeRouteIds);
    if (!dispatched) {
      await this.prisma.platformAlertHistory.update({
        where: { id: alert.id },
        data: {
          channels_notified: [],
          escalation_state: excludeRouteIds.size > 0 ? 'expired' : 'dispatched',
          next_escalation_at: null,
        },
      });
      return [];
    }

    const nextEscalationAt = new Date(Date.now() + dispatched.step.ack_window_minutes * 60_000);
    await this.prisma.platformAlertHistory.update({
      where: { id: alert.id },
      data: {
        channels_notified: dispatched.notified,
        current_escalation_step: dispatched.index,
        escalation_state: 'awaiting_ack',
        next_escalation_at: nextEscalationAt,
      },
    });
    return dispatched.notified;
  }

  async escalateNext(alertHistoryId: string): Promise<void> {
    const alert = await this.findAlert(alertHistoryId);
    if (alert.status !== 'fired') {
      return;
    }
    const policy = await this.findPolicy(alert);
    if (!policy) {
      await this.expire(alert.id);
      return;
    }
    const steps = alertEscalationStepsStoredSchema.parse(policy.steps);
    const dispatched = await this.dispatchFirstAvailableStep(
      alert,
      steps,
      alert.current_escalation_step + 1,
      new Set<string>(),
    );
    if (!dispatched) {
      await this.expire(alert.id);
      return;
    }
    await this.prisma.platformAlertHistory.update({
      where: { id: alert.id },
      data: {
        channels_notified: { push: dispatched.notified },
        current_escalation_step: dispatched.index,
        escalation_state: 'escalating',
        next_escalation_at: new Date(Date.now() + dispatched.step.ack_window_minutes * 60_000),
      },
    });
  }

  async acknowledge(input: {
    alert_history_id: string;
    comment?: string;
    route_id?: string;
    user_id: string;
  }): Promise<PlatformAlertHistory> {
    const alert = await this.findAlert(input.alert_history_id);
    if (alert.status === 'resolved') {
      return alert;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.platformAlertAcknowledgement.upsert({
        where: { alert_history_id: input.alert_history_id },
        update: {
          acknowledged_at: new Date(),
          acknowledged_by_user_id: input.user_id,
          acknowledged_via_route_id: input.route_id ?? null,
          comment: input.comment ?? null,
        },
        create: {
          acknowledged_by_user_id: input.user_id,
          acknowledged_via_route_id: input.route_id ?? null,
          alert_history_id: input.alert_history_id,
          comment: input.comment ?? null,
        },
      });
      return tx.platformAlertHistory.update({
        where: { id: input.alert_history_id },
        data: {
          acknowledged_at: new Date(),
          acknowledged_by: input.user_id,
          acknowledged_via_route_id: input.route_id ?? null,
          escalation_state: 'acknowledged',
          next_escalation_at: null,
          status: 'acknowledged',
        },
      });
    });

    await this.platformIncidentService.recordAlertAcknowledged(
      input.alert_history_id,
      updated.acknowledged_at ?? new Date(),
    );
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: updated.id,
      rule_id: updated.rule_id,
      type: 'alert_acknowledged',
    });
    return updated;
  }

  async acknowledgeMagicToken(token: string): Promise<PlatformAlertHistory> {
    const payload = await this.ackTokens.verify(token);
    const platformUser = await this.prisma.platformUser.findUnique({
      where: { id: payload.platform_user_id },
      select: { user_id: true },
    });
    if (!platformUser) {
      throw new NotFoundException({
        code: 'PLATFORM_USER_NOT_FOUND',
        message: 'Platform user referenced by the acknowledgement token was not found.',
      });
    }
    return this.acknowledge({
      alert_history_id: payload.alert_history_id,
      route_id: payload.route_id,
      user_id: platformUser.user_id,
    });
  }

  async resolveSilently(
    alertHistoryId: string,
    reason: 'condition_resolved' | 'manual',
  ): Promise<void> {
    await this.prisma.platformAlertHistory.update({
      where: { id: alertHistoryId },
      data: {
        escalation_state: reason === 'condition_resolved' ? 'auto_resolved' : 'idle',
        next_escalation_at: null,
        resolved_at: new Date(),
        status: 'resolved',
      },
    });
  }

  async emitRouteHealthFailure(
    route: Pick<PlatformAlertRoute, 'display_name' | 'id'>,
  ): Promise<void> {
    const rule = await this.ensureRouteHealthRule(route);
    const alert = await this.prisma.platformAlertHistory.create({
      data: {
        channels_notified: [],
        message: `[CRITICAL] Alert route health check failed for ${route.display_name}.`,
        metric_value: new Prisma.Decimal(1),
        rule_id: rule.id,
        severity: 'critical',
        status: 'fired',
      },
    });
    await this.dispatchInitial(alert.id, new Set([route.id]));
    await this.redisPubSub.publish('platform:alerts', {
      alert_id: alert.id,
      message: alert.message,
      metric_value: 1,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: 'critical',
      type: 'alert_fired',
    });
  }

  private async dispatchStep(
    alert: PlatformAlertHistory & { rule: PlatformAlertRule },
    step: AlertEscalationStepStored,
    excludeRouteIds: Set<string>,
  ): Promise<string[]> {
    const route = await this.prisma.platformAlertRoute.findUnique({
      where: { id: step.route_id },
      include: { channel: true, health_checks: { orderBy: { ran_at: 'desc' }, take: 1 } },
    });
    if (!route || excludeRouteIds.has(route.id) || !route.enabled || !route.channel.is_enabled) {
      return [];
    }
    if (
      isSuppressedByQuietHours({
        criticalOverrideQuiet: route.critical_override_quiet,
        end: route.quiet_hours_end,
        severity: alert.severity,
        start: route.quiet_hours_start,
        timezone: route.quiet_hours_timezone,
      })
    ) {
      return [];
    }

    const ackPlatformUser = await this.defaultAckPlatformUser();
    const ackUrl = ackPlatformUser
      ? this.buildAckUrl(
          this.ackTokens.sign({
            alert_history_id: alert.id,
            platform_user_id: ackPlatformUser.id,
            route_id: route.id,
          }),
        )
      : undefined;
    const payload: AlertPayload = {
      ack_url: ackUrl,
      message: alert.message,
      metric_value: Number(alert.metric_value),
      rule_name: alert.rule.name,
      severity: alert.severity,
    };
    const result = await this.channelDispatch.sendSyntheticAlert(
      this.routesService.routeToDispatchChannel(route, 'operator'),
      payload,
    );
    if (!result.success) {
      this.logger.warn(`[dispatchStep] route=${route.id} failed: ${result.message}`);
      return [];
    }
    return [route.display_name];
  }

  private async dispatchFirstAvailableStep(
    alert: PlatformAlertHistory & { rule: PlatformAlertRule },
    steps: AlertEscalationStepStored[],
    startIndex: number,
    excludeRouteIds: Set<string>,
  ): Promise<{ index: number; notified: string[]; step: AlertEscalationStepStored } | null> {
    for (let index = startIndex; index < steps.length; index += 1) {
      const step = steps[index];
      if (!step) continue;
      const notified = await this.dispatchStep(alert, step, excludeRouteIds);
      if (notified.length > 0) {
        return { index, notified, step };
      }
    }
    return null;
  }

  private async dispatchFallback(
    alert: PlatformAlertHistory & { rule: PlatformAlertRule },
  ): Promise<string[]> {
    const ruleChannels = await this.prisma.platformAlertRuleChannel.findMany({
      where: { rule_id: alert.rule_id },
      include: { channel: true },
    });
    const channels =
      ruleChannels.length > 0
        ? await this.channelDispatch.dispatchAlert(
            {
              message: alert.message,
              metric_value: Number(alert.metric_value),
              rule_name: alert.rule.name,
              severity: alert.severity,
            },
            ruleChannels.map((ruleChannel) => ruleChannel.channel),
          )
        : await this.legacyDispatch.sendEmail(alert.rule, alert, Number(alert.metric_value));
    await this.prisma.platformAlertHistory.update({
      where: { id: alert.id },
      data: { channels_notified: channels, escalation_state: 'dispatched' },
    });
    return channels;
  }

  private async expire(alertHistoryId: string): Promise<void> {
    await this.prisma.platformAlertHistory.update({
      where: { id: alertHistoryId },
      data: { escalation_state: 'expired', next_escalation_at: null },
    });
  }

  private async findAlert(alertHistoryId: string) {
    const alert = await this.prisma.platformAlertHistory.findUnique({
      where: { id: alertHistoryId },
      include: { rule: true },
    });
    if (!alert) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Alert "${alertHistoryId}" not found`,
      });
    }
    return alert;
  }

  private async findPolicy(alert: PlatformAlertHistory & { rule: { metric: string } }) {
    return this.prisma.platformAlertEscalationPolicy.findFirst({
      where: {
        applies_to_severity: alert.severity,
        enabled: true,
        OR: [
          { applies_to_alert_keys: { isEmpty: true } },
          { applies_to_alert_keys: { has: alert.rule.metric } },
        ],
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private async defaultAckPlatformUser(): Promise<{ id: string } | null> {
    return this.prisma.platformUser.findFirst({
      where: {
        revoked_at: null,
        roles: { some: { role: { role_key: 'platform_owner' } } },
        user: { global_status: 'active' },
      },
      orderBy: { invited_at: 'asc' },
      select: { id: true },
    });
  }

  private buildAckUrl(token: string): string {
    const baseUrl = process.env.APP_URL ?? 'https://dua.edupod.app';
    return `${baseUrl.replace(/\/$/, '')}/api/v1/admin/alerts/ack/${token}`;
  }

  private async ensureRouteHealthRule(route: Pick<PlatformAlertRoute, 'display_name' | 'id'>) {
    const metric = `alerts.route.dead_man_failed:${route.id}`;
    const existing = await this.prisma.platformAlertRule.findFirst({ where: { metric } });
    if (existing) return existing;
    return this.prisma.platformAlertRule.create({
      data: {
        condition_config: { operator: 'gte', threshold: 1 },
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: true,
        metric,
        name: `Alert route watchdog failed: ${route.display_name}`,
        notify_emails: [],
        severity: 'critical',
      },
    });
  }
}
