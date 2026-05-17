import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  createAlertRouteSchema,
  type CreateAlertRouteDto,
  type TestAlertRouteDto,
  type UpdateAlertRouteDto,
  updateAlertRouteSchema,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { ChannelDispatchService } from './channel-dispatch.service';
import type {
  AlertChannelForDispatch,
  AlertPayload,
} from './dispatchers/channel-dispatcher.interface';

type AlertRouteRow = Prisma.PlatformAlertRouteGetPayload<{
  include: {
    channel: true;
    health_checks: { orderBy: { ran_at: 'desc' }; take: 1 };
  };
}>;

const destinationSchema = z.record(z.unknown());

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function routeDestinationConfig(
  route: Pick<AlertRouteRow, 'channel' | 'health_check_destination' | 'operator_destination'>,
  purpose: 'health_check' | 'operator',
): unknown {
  const destination = destinationSchema.parse(
    purpose === 'health_check' ? route.health_check_destination : route.operator_destination,
  );

  switch (route.channel.type) {
    case 'email': {
      const recipient = destination.email;
      const recipients = destination.recipients;
      return {
        recipients: Array.isArray(recipients)
          ? recipients
          : typeof recipient === 'string'
            ? [recipient]
            : [],
      };
    }
    case 'push':
      return destination;
    case 'telegram': {
      const stored = z
        .object({
          bot_token_encrypted: z.string(),
          bot_token_key_ref: z.string(),
          bot_token_mask: z.string().optional(),
          chat_id: z.string(),
        })
        .parse(route.channel.config);
      const chatId = destination.telegram_chat_id ?? destination.chat_id;
      return {
        bot_token_encrypted: stored.bot_token_encrypted,
        bot_token_key_ref: stored.bot_token_key_ref,
        chat_id: typeof chatId === 'string' ? chatId : stored.chat_id,
      };
    }
    case 'whatsapp': {
      const toNumber =
        destination.to_number ?? destination.phone_e164 ?? destination.whatsapp_phone;
      return { to_number: toNumber };
    }
  }
}

function destinationsMatch(operatorDestination: unknown, healthCheckDestination: unknown): boolean {
  return JSON.stringify(operatorDestination) === JSON.stringify(healthCheckDestination);
}

@Injectable()
export class AlertRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly dispatch: ChannelDispatchService,
  ) {}

  async list(): Promise<AlertRouteRow[]> {
    return this.prisma.platformAlertRoute.findMany({
      orderBy: [{ enabled: 'desc' }, { display_name: 'asc' }],
      include: this.includeRoute(),
    });
  }

  async create(dto: CreateAlertRouteDto, audit?: PlatformAuditContext): Promise<AlertRouteRow> {
    const parsed = createAlertRouteSchema.parse(dto);
    await this.assertChannelExists(parsed.channel_id);
    this.assertDistinctDestinations(parsed.operator_destination, parsed.health_check_destination);

    const route = await this.prisma.platformAlertRoute.create({
      data: {
        channel_id: parsed.channel_id,
        critical_override_quiet: parsed.critical_override_quiet,
        dead_man_interval_minutes: parsed.dead_man_interval_minutes,
        display_name: parsed.display_name,
        enabled: parsed.enabled,
        health_check_destination: toJson(parsed.health_check_destination),
        operator_destination: toJson(parsed.operator_destination),
        quiet_hours_end: parsed.quiet_hours_end ?? null,
        quiet_hours_start: parsed.quiet_hours_start ?? null,
        quiet_hours_timezone: parsed.quiet_hours_timezone,
        urgency_tier: parsed.urgency_tier,
      },
      include: this.includeRoute(),
    });

    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_route_created',
        payload: { after: route },
        target_resource_id: route.id,
        target_resource_type: 'alert_route',
      });
    }
    return route;
  }

  async update(
    id: string,
    dto: UpdateAlertRouteDto,
    audit?: PlatformAuditContext,
  ): Promise<AlertRouteRow> {
    const existing = await this.findRouteOrThrow(id);
    const merged = {
      channel_id: existing.channel_id,
      critical_override_quiet: existing.critical_override_quiet,
      dead_man_interval_minutes: existing.dead_man_interval_minutes,
      display_name: existing.display_name,
      enabled: existing.enabled,
      health_check_destination: existing.health_check_destination,
      operator_destination: existing.operator_destination,
      quiet_hours_end: existing.quiet_hours_end ?? undefined,
      quiet_hours_start: existing.quiet_hours_start ?? undefined,
      quiet_hours_timezone: existing.quiet_hours_timezone,
      urgency_tier: existing.urgency_tier,
      ...dto,
    };
    const parsed = createAlertRouteSchema.parse(merged);
    const updateParsed = updateAlertRouteSchema.parse(dto);
    if (updateParsed.channel_id) {
      await this.assertChannelExists(updateParsed.channel_id);
    }
    this.assertDistinctDestinations(parsed.operator_destination, parsed.health_check_destination);

    const data: Prisma.PlatformAlertRouteUpdateInput = {};
    if (dto.channel_id !== undefined) data.channel = { connect: { id: parsed.channel_id } };
    if (dto.critical_override_quiet !== undefined)
      data.critical_override_quiet = parsed.critical_override_quiet;
    if (dto.dead_man_interval_minutes !== undefined)
      data.dead_man_interval_minutes = parsed.dead_man_interval_minutes;
    if (dto.display_name !== undefined) data.display_name = parsed.display_name;
    if (dto.enabled !== undefined) data.enabled = parsed.enabled;
    if (dto.health_check_destination !== undefined)
      data.health_check_destination = toJson(parsed.health_check_destination);
    if (dto.operator_destination !== undefined)
      data.operator_destination = toJson(parsed.operator_destination);
    if (dto.quiet_hours_end !== undefined) data.quiet_hours_end = parsed.quiet_hours_end ?? null;
    if (dto.quiet_hours_start !== undefined)
      data.quiet_hours_start = parsed.quiet_hours_start ?? null;
    if (dto.quiet_hours_timezone !== undefined)
      data.quiet_hours_timezone = parsed.quiet_hours_timezone;
    if (dto.urgency_tier !== undefined) data.urgency_tier = parsed.urgency_tier;

    const updated = await this.prisma.platformAlertRoute.update({
      where: { id },
      data,
      include: this.includeRoute(),
    });

    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_route_updated',
        payload: { before: existing, after: updated },
        target_resource_id: id,
        target_resource_type: 'alert_route',
      });
    }
    return updated;
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.findRouteOrThrow(id);
    await this.prisma.platformAlertRoute.delete({ where: { id } });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_route_deleted',
        payload: { before: existing },
        target_resource_id: id,
        target_resource_type: 'alert_route',
      });
    }
  }

  async test(
    id: string,
    actorUserId: string,
    dto: TestAlertRouteDto,
    audit?: PlatformAuditContext,
  ): Promise<{ success: boolean; message: string }> {
    const route = await this.findRouteOrThrow(id);
    const started = Date.now();
    const result = await this.dispatch.sendSyntheticAlert(
      this.routeToDispatchChannel(route, 'operator'),
      this.testPayload(dto.comment),
    );
    const healthCheck = await this.prisma.platformAlertRouteHealthCheck.create({
      data: {
        failure_detail: result.success ? undefined : { message: result.message },
        latency_ms: Date.now() - started,
        route_id: id,
        success: result.success,
        triggered_by: 'manual',
        triggered_by_user_id: actorUserId,
      },
    });
    await this.prisma.platformAlertRoute.update({
      where: { id },
      data: {
        last_health_check_at: healthCheck.ran_at,
        last_health_check_status: result.success ? 'ok' : 'failed',
      },
    });

    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_route_tested',
        payload: { after: { health_check_id: healthCheck.id, result } },
        reason: dto.comment,
        target_resource_id: id,
        target_resource_type: 'alert_route',
      });
    }
    return result;
  }

  async routeHealth() {
    return this.prisma.platformAlertRouteHealthCheck.findMany({
      orderBy: { ran_at: 'desc' },
      take: 100,
      include: { route: { include: { channel: true } } },
    });
  }

  routeToDispatchChannel(
    route: AlertRouteRow,
    purpose: 'health_check' | 'operator',
  ): AlertChannelForDispatch {
    return {
      config: routeDestinationConfig(route, purpose),
      id: route.id,
      is_enabled: route.enabled && route.channel.is_enabled,
      name: route.display_name,
      type: route.channel.type,
    };
  }

  testPayload(comment?: string): AlertPayload {
    return {
      is_test: true,
      message: `[SYNTHETIC TEST] ${comment ?? 'Operator-triggered alert route test.'}`,
      metric_value: 0,
      rule_name: 'Alert route test',
      severity: 'info',
    };
  }

  private async assertChannelExists(channelId: string): Promise<void> {
    const channel = await this.prisma.platformAlertChannel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) {
      throw new NotFoundException({
        code: 'ALERT_CHANNEL_NOT_FOUND',
        message: `Alert channel "${channelId}" not found`,
      });
    }
  }

  private assertDistinctDestinations(
    operatorDestination: unknown,
    healthCheckDestination: unknown,
  ) {
    if (destinationsMatch(operatorDestination, healthCheckDestination)) {
      throw new UnprocessableEntityException({
        code: 'ALERT_ROUTE_DESTINATIONS_NOT_DISTINCT',
        message: 'Health-check sink destination must differ from the operator destination.',
      });
    }
  }

  private async findRouteOrThrow(id: string): Promise<AlertRouteRow> {
    const route = await this.prisma.platformAlertRoute.findUnique({
      where: { id },
      include: this.includeRoute(),
    });
    if (!route) {
      throw new NotFoundException({
        code: 'ALERT_ROUTE_NOT_FOUND',
        message: `Alert route "${id}" not found`,
      });
    }
    return route;
  }

  private includeRoute() {
    return {
      channel: true,
      health_checks: { orderBy: { ran_at: 'desc' as const }, take: 1 },
    } satisfies Prisma.PlatformAlertRouteInclude;
  }
}
