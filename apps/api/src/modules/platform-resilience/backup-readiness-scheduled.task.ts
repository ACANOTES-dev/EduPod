import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { BackupReadinessService } from './backup-readiness.service';
import { OffsiteReplicationPollerService } from './offsite-replication-poller.service';

@Injectable()
export class BackupReadinessScheduledTask {
  private readonly logger = new Logger(BackupReadinessScheduledTask.name);

  constructor(
    private readonly backups: BackupReadinessService,
    private readonly replications: OffsiteReplicationPollerService,
  ) {}

  @Cron('*/15 * * * *')
  async tick(): Promise<void> {
    try {
      await this.replications.poll();
    } catch (err: unknown) {
      this.logger.warn(
        'Off-site replication metadata poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    }

    try {
      await this.backups.checkAndAlert();
    } catch (err: unknown) {
      this.logger.error(
        'Backup readiness check failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
