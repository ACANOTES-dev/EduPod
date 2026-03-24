import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { GRADEBOOK_DETECT_RISKS_JOB } from '../processors/gradebook/gradebook-risk-detection.processor';
import { REPORT_CARD_AUTO_GENERATE_JOB } from '../processors/gradebook/report-card-auto-generate.processor';

/**
 * Registers BullMQ repeatable (cron) jobs on module startup.
 * Only one instance of each repeatable job key is kept in Redis —
 * BullMQ deduplicates by the jobId (repeatJobKey) automatically.
 */
@Injectable()
export class CronSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CronSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.GRADEBOOK) private readonly gradebookQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerGradebookCronJobs();
  }

  private async registerGradebookCronJobs(): Promise<void> {
    // ── gradebook:detect-risks ─────────────────────────────────────────────
    // Runs daily at 02:00 AM (UTC). Cross-tenant — no tenant_id in payload.
    // The processor iterates all active tenants and checks each tenant's
    // frequency setting to decide whether to run detection for that tenant.
    await this.gradebookQueue.add(
      GRADEBOOK_DETECT_RISKS_JOB,
      {},
      {
        repeat: { pattern: '0 2 * * *' },
        jobId: `cron:${GRADEBOOK_DETECT_RISKS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${GRADEBOOK_DETECT_RISKS_JOB} (daily 02:00 UTC)`);

    // ── report-cards:auto-generate ─────────────────────────────────────────
    // Runs daily at 03:00 AM (UTC). Checks all tenants for recently ended
    // academic periods and auto-generates draft report cards.
    await this.gradebookQueue.add(
      REPORT_CARD_AUTO_GENERATE_JOB,
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: `cron:${REPORT_CARD_AUTO_GENERATE_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${REPORT_CARD_AUTO_GENERATE_JOB} (daily 03:00 UTC)`);
  }
}
