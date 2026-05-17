import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AlertRoutesService } from './alert-routes.service';
import { AlertRoutingService } from './alert-routing.service';
import { ChannelDispatchService } from './channel-dispatch.service';

const DEAD_MAN_INTERVAL_MS = 60_000;

@Injectable()
export class AlertRouteDeadManCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertRouteDeadManCronService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: ChannelDispatchService,
    private readonly routes: AlertRoutesService,
    private readonly routing: AlertRoutingService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => void this.tick(), DEAD_MAN_INTERVAL_MS);
    this.logger.log('Alert route dead-man cron started (every minute)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async tick(now = new Date()): Promise<void> {
    const routes = await this.prisma.platformAlertRoute.findMany({
      where: { enabled: true },
      include: { channel: true, health_checks: { orderBy: { ran_at: 'desc' }, take: 1 } },
    });

    for (const route of routes) {
      const lastChecked = route.last_health_check_at;
      const dueAt = lastChecked
        ? new Date(lastChecked.getTime() + route.dead_man_interval_minutes * 60_000)
        : new Date(0);
      if (dueAt > now) {
        continue;
      }
      await this.runRouteCheck(route.id);
    }
  }

  async runRouteCheck(routeId: string): Promise<void> {
    const route = await this.prisma.platformAlertRoute.findUnique({
      where: { id: routeId },
      include: { channel: true, health_checks: { orderBy: { ran_at: 'desc' }, take: 1 } },
    });
    if (!route) return;

    const started = Date.now();
    const destinationsEqual =
      JSON.stringify(route.operator_destination) === JSON.stringify(route.health_check_destination);
    const result = destinationsEqual
      ? { message: 'sink_destination_equals_operator', success: false }
      : await this.dispatch.sendSyntheticAlert(
          this.routes.routeToDispatchChannel(route, 'health_check'),
          {
            is_dead_man_check: true,
            is_test: true,
            message: '[SYNTHETIC TEST] Synthetic monitoring ping - discard.',
            metric_value: 0,
            rule_name: 'Alert route dead-man check',
            severity: 'info',
          },
        );

    const healthCheck = await this.prisma.platformAlertRouteHealthCheck.create({
      data: {
        failure_detail: result.success ? undefined : { message: result.message },
        latency_ms: Date.now() - started,
        route_id: route.id,
        success: result.success,
        triggered_by: 'schedule',
      },
    });
    await this.prisma.platformAlertChannel.update({
      where: { id: route.channel_id },
      data: { last_health_check_at: healthCheck.ran_at },
    });
    await this.prisma.platformAlertRoute.update({
      where: { id: route.id },
      data: {
        last_health_check_at: healthCheck.ran_at,
        last_health_check_status: result.success ? 'ok' : 'failed',
      },
    });

    if (!result.success) {
      this.logger.warn(`[runRouteCheck] route=${route.id} failed: ${result.message}`);
      await this.routing.emitRouteHealthFailure(route);
    }
  }
}
