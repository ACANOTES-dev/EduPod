import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { RedisPubSubService } from '../platform/redis-pubsub.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { PlatformErrorLogService } from './platform-error-log.service';

@Injectable()
export class PlatformErrorLogMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformErrorLogMaintenanceService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastRetentionRun: string | null = null;
  private lastIntegrityRun: string | null = null;

  constructor(
    private readonly platformAuditService: PlatformAuditService,
    private readonly platformErrorLogService: PlatformErrorLogService,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(
      () => {
        void this.runDueTasks().catch((err: unknown) => {
          this.logger.error(`Platform error-log maintenance failed: ${(err as Error).message}`);
        });
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  async runDueTasks(now = new Date()): Promise<void> {
    const dayKey = now.toISOString().slice(0, 10);
    const actorUserId = await this.platformErrorLogService.resolveMaintenanceActor();

    if (now.getUTCHours() >= 4 && this.lastRetentionRun !== dayKey && actorUserId) {
      const purged = await this.platformErrorLogService.purgeExpired(actorUserId, now);
      this.lastRetentionRun = dayKey;
      this.logger.log(`Purged ${purged} platform error-log row(s) older than 90 days`);
    }

    if (now.getUTCHours() >= 4 && this.lastIntegrityRun !== dayKey) {
      const result = await this.platformAuditService.verifyChainIntegrity();
      this.lastIntegrityRun = dayKey;
      if (result.broken_at) {
        await this.redisPubSubService.publish('platform:alerts', {
          type: 'audit_integrity_broken',
          severity: 'critical',
          broken_at: result.broken_at,
          checked_at: now.toISOString(),
        });
      }
    }
  }
}
