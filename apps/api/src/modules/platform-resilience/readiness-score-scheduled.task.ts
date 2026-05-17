import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ReadinessAlertEvaluatorService } from './readiness-alert-evaluator.service';
import { ReadinessScoreService } from './readiness-score.service';

@Injectable()
export class ReadinessScoreScheduledTask {
  private readonly logger = new Logger(ReadinessScoreScheduledTask.name);

  constructor(
    private readonly readiness: ReadinessScoreService,
    private readonly alerts: ReadinessAlertEvaluatorService,
  ) {}

  @Cron('0 */5 * * * *')
  async liveEvaluate(): Promise<void> {
    try {
      const result = await this.readiness.compute();
      await this.alerts.evaluate(result);
    } catch (err: unknown) {
      this.logger.error(
        'Readiness live evaluation failed',
        err instanceof Error ? err.stack : String(err),
      );
      await this.alerts.recordLiveFailure(err);
    }
  }

  @Cron('0 5 0 * * *', { timeZone: 'UTC' })
  async dailySnapshot(): Promise<void> {
    try {
      await this.readiness.snapshot();
    } catch (err: unknown) {
      this.logger.error(
        'Readiness daily snapshot failed',
        err instanceof Error ? err.stack : String(err),
      );
      await this.alerts.recordDailySnapshotFailure(err);
    }
  }
}
