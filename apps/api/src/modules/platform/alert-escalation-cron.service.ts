import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { AlertRoutingService } from './alert-routing.service';

const ESCALATION_INTERVAL_MS = 30_000;

@Injectable()
export class AlertEscalationCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEscalationCronService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: AlertRoutingService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => void this.tick(), ESCALATION_INTERVAL_MS);
    this.logger.log('Alert escalation cron started (every 30s)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async tick(now = new Date()): Promise<void> {
    const dueAlerts = await this.prisma.platformAlertHistory.findMany({
      where: {
        escalation_state: { in: ['awaiting_ack', 'escalating'] },
        next_escalation_at: { lte: now },
        status: 'fired',
      },
      orderBy: { next_escalation_at: 'asc' },
      take: 25,
    });

    for (const alert of dueAlerts) {
      try {
        await this.routing.escalateNext(alert.id);
      } catch (err: unknown) {
        this.logger.error(`[tick] Failed to escalate alert ${alert.id}`, err);
      }
    }
  }
}
