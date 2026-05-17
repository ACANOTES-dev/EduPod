import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_AUDIT_RETENTION_DAYS = 90;
const HOURLY_SUMMARY_RETENTION_DAYS = 180;

@Injectable()
export class SentryRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SentryRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.purgeExpired().catch((err: unknown) => {
        this.logger.error(
          'Sentry retention cleanup failed.',
          err instanceof Error ? err.stack : undefined,
        );
      });
    }, RETENTION_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async purgeExpired(
    now = new Date(),
  ): Promise<{ audit_deleted: number; summary_deleted: number }> {
    const auditCutoff = new Date(
      now.getTime() - WEBHOOK_AUDIT_RETENTION_DAYS * RETENTION_INTERVAL_MS,
    );
    const summaryCutoff = new Date(
      now.getTime() - HOURLY_SUMMARY_RETENTION_DAYS * RETENTION_INTERVAL_MS,
    );
    const [audit, summary] = await Promise.all([
      this.prisma.platformSentryWebhookAudit.deleteMany({
        where: { received_at: { lt: auditCutoff } },
      }),
      this.prisma.platformSentryEventsSummary.deleteMany({
        where: { hour_bucket: { lt: summaryCutoff } },
      }),
    ]);
    return { audit_deleted: audit.count, summary_deleted: summary.count };
  }
}
