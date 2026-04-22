import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { CHECKIN_ALERT_JOB, CheckinAlertProcessor } from './checkin-alert.processor';
import { ESCALATION_TIMEOUT_JOB, EscalationTimeoutProcessor } from './escalation-timeout.processor';
import {
  INTERVENTION_REVIEW_REMINDER_JOB,
  InterventionReviewReminderProcessor,
} from './intervention-review-reminder.processor';
import { NOTIFY_CONCERN_JOB, NotifyConcernProcessor } from './notify-concern.processor';
import { OVERDUE_ACTIONS_JOB, OverdueActionsProcessor } from './overdue-actions.processor';
import {
  PASTORAL_CRON_DISPATCH_OVERDUE_JOB,
  PastoralCronDispatchProcessor,
} from './pastoral-cron-dispatch.processor';
import { PRECOMPUTE_AGENDA_JOB, PrecomputeAgendaProcessor } from './precompute-agenda.processor';
import {
  SYNC_BEHAVIOUR_SAFEGUARDING_JOB,
  SyncBehaviourSafeguardingProcessor,
} from './sync-behaviour-safeguarding.processor';
import {
  WELLBEING_FLAG_EXPIRY_JOB,
  WellbeingFlagExpiryProcessor,
} from './wellbeing-flag-expiry.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.PASTORAL, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class PastoralQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(PastoralQueueDispatcher.name);

  constructor(
    private readonly checkinAlert: CheckinAlertProcessor,
    private readonly escalationTimeout: EscalationTimeoutProcessor,
    private readonly interventionReviewReminder: InterventionReviewReminderProcessor,
    private readonly notifyConcern: NotifyConcernProcessor,
    private readonly overdueActions: OverdueActionsProcessor,
    private readonly pastoralCronDispatch: PastoralCronDispatchProcessor,
    private readonly precomputeAgenda: PrecomputeAgendaProcessor,
    private readonly syncBehaviourSafeguarding: SyncBehaviourSafeguardingProcessor,
    private readonly wellbeingFlagExpiry: WellbeingFlagExpiryProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CHECKIN_ALERT_JOB:
        await this.checkinAlert.process(job);
        return;
      case ESCALATION_TIMEOUT_JOB:
        await this.escalationTimeout.process(job);
        return;
      case INTERVENTION_REVIEW_REMINDER_JOB:
        await this.interventionReviewReminder.process(job);
        return;
      case NOTIFY_CONCERN_JOB:
        await this.notifyConcern.process(job);
        return;
      case OVERDUE_ACTIONS_JOB:
        await this.overdueActions.process(job);
        return;
      case PASTORAL_CRON_DISPATCH_OVERDUE_JOB:
        await this.pastoralCronDispatch.process(job);
        return;
      case PRECOMPUTE_AGENDA_JOB:
        await this.precomputeAgenda.process(job);
        return;
      case SYNC_BEHAVIOUR_SAFEGUARDING_JOB:
        await this.syncBehaviourSafeguarding.process(job);
        return;
      case WELLBEING_FLAG_EXPIRY_JOB:
        await this.wellbeingFlagExpiry.process(job);
        return;
      default:
        this.logger.warn(`Unknown pastoral job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for pastoral job "${job.name}"`);
    }
  }
}
