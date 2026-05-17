import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { EvidenceFreshnessService } from './evidence-freshness.service';

@Injectable()
export class EvidenceFreshnessScheduledTask {
  private readonly logger = new Logger(EvidenceFreshnessScheduledTask.name);

  constructor(private readonly freshness: EvidenceFreshnessService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.freshness.checkAll();
    } catch (err: unknown) {
      this.logger.error(
        'Evidence freshness scheduled task failed',
        err instanceof Error ? err.stack : String(err),
      );
      await this.freshness.emitMetaFailure(err);
    }
  }
}
