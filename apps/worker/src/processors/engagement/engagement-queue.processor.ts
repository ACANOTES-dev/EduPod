import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { CANCEL_EVENT_JOB, CancelEventProcessor } from './cancel-event.processor';
import { CHASE_OUTSTANDING_JOB, ChaseOutstandingProcessor } from './chase-outstanding.processor';
import {
  ANNUAL_CONSENT_RENEWAL_JOB,
  EngagementAnnualRenewalProcessor,
} from './engagement-annual-renewal.processor';
import {
  CONFERENCE_REMINDERS_JOB,
  EngagementConferenceRemindersProcessor,
} from './engagement-conference-reminders.processor';
import {
  DISTRIBUTE_FORMS_JOB,
  EngagementDistributeFormsProcessor,
} from './engagement-distribute-forms.processor';
import {
  GENERATE_TRIP_PACK_JOB,
  GenerateTripPackProcessor,
} from './engagement-generate-trip-pack.processor';
import { EXPIRE_PENDING_JOB, ExpirePendingProcessor } from './expire-pending.processor';
import {
  GENERATE_EVENT_INVOICES_JOB,
  GenerateEventInvoicesProcessor,
} from './generate-invoices.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EngagementQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(EngagementQueueDispatcher.name);

  constructor(
    private readonly cancelEvent: CancelEventProcessor,
    private readonly chaseOutstanding: ChaseOutstandingProcessor,
    private readonly engagementAnnualRenewal: EngagementAnnualRenewalProcessor,
    private readonly engagementConferenceReminders: EngagementConferenceRemindersProcessor,
    private readonly engagementDistributeForms: EngagementDistributeFormsProcessor,
    private readonly generateTripPack: GenerateTripPackProcessor,
    private readonly expirePending: ExpirePendingProcessor,
    private readonly generateEventInvoices: GenerateEventInvoicesProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CANCEL_EVENT_JOB:
        await this.cancelEvent.process(job);
        return;
      case CHASE_OUTSTANDING_JOB:
        await this.chaseOutstanding.process(job);
        return;
      case ANNUAL_CONSENT_RENEWAL_JOB:
        await this.engagementAnnualRenewal.process(job);
        return;
      case CONFERENCE_REMINDERS_JOB:
        await this.engagementConferenceReminders.process(job);
        return;
      case DISTRIBUTE_FORMS_JOB:
        await this.engagementDistributeForms.process(job);
        return;
      case GENERATE_TRIP_PACK_JOB:
        await this.generateTripPack.process(job);
        return;
      case EXPIRE_PENDING_JOB:
        await this.expirePending.process(job);
        return;
      case GENERATE_EVENT_INVOICES_JOB:
        await this.generateEventInvoices.process(job);
        return;
      default:
        this.logger.warn(`Unknown engagement job name "${job.name}" (id=${job.id})`);
        throw new Error(`No handler registered for engagement job "${job.name}"`);
    }
  }
}
