import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  CLEANUP_PARTICIPATION_TOKENS_JOB,
  CleanupParticipationTokensProcessor,
} from './cleanup-participation-tokens.processor';
import { EAP_REFRESH_CHECK_JOB, EapRefreshCheckProcessor } from './eap-refresh-check.processor';
import { MODERATION_SCAN_JOB, ModerationScanProcessor } from './moderation-scan.processor';
import {
  SURVEY_CLOSING_REMINDER_JOB,
  SurveyClosingReminderProcessor,
} from './survey-closing-reminder.processor';
import { SURVEY_OPEN_NOTIFY_JOB, SurveyOpenNotifyProcessor } from './survey-open-notify.processor';
import { WORKLOAD_METRICS_JOB, WorkloadMetricsProcessor } from './workload-metrics.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.WELLBEING, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class WellbeingQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(WellbeingQueueDispatcher.name);

  constructor(
    private readonly cleanupParticipationTokens: CleanupParticipationTokensProcessor,
    private readonly eapRefreshCheck: EapRefreshCheckProcessor,
    private readonly moderationScan: ModerationScanProcessor,
    private readonly surveyClosingReminder: SurveyClosingReminderProcessor,
    private readonly surveyOpenNotify: SurveyOpenNotifyProcessor,
    private readonly workloadMetrics: WorkloadMetricsProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CLEANUP_PARTICIPATION_TOKENS_JOB:
        await this.cleanupParticipationTokens.process(job);
        return;
      case EAP_REFRESH_CHECK_JOB:
        await this.eapRefreshCheck.process(job);
        return;
      case MODERATION_SCAN_JOB:
        await this.moderationScan.process(job);
        return;
      case SURVEY_CLOSING_REMINDER_JOB:
        await this.surveyClosingReminder.process(job);
        return;
      case SURVEY_OPEN_NOTIFY_JOB:
        await this.surveyOpenNotify.process(job);
        return;
      case WORKLOAD_METRICS_JOB:
        await this.workloadMetrics.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown wellbeing job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
