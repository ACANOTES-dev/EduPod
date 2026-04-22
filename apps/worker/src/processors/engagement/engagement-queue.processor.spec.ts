import { Job } from 'bullmq';

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
import { EngagementQueueDispatcher } from './engagement-queue.processor';
import { EXPIRE_PENDING_JOB, ExpirePendingProcessor } from './expire-pending.processor';
import {
  GENERATE_EVENT_INVOICES_JOB,
  GenerateEventInvoicesProcessor,
} from './generate-invoices.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('EngagementQueueDispatcher', () => {
  function buildDispatcher() {
    const cancelEvent = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as CancelEventProcessor;
    const chaseOutstanding = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChaseOutstandingProcessor;
    const engagementAnnualRenewal = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EngagementAnnualRenewalProcessor;
    const engagementConferenceReminders = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EngagementConferenceRemindersProcessor;
    const engagementDistributeForms = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EngagementDistributeFormsProcessor;
    const generateTripPack = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as GenerateTripPackProcessor;
    const expirePending = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ExpirePendingProcessor;
    const generateEventInvoices = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as GenerateEventInvoicesProcessor;

    const dispatcher = new EngagementQueueDispatcher(
      cancelEvent,
      chaseOutstanding,
      engagementAnnualRenewal,
      engagementConferenceReminders,
      engagementDistributeForms,
      generateTripPack,
      expirePending,
      generateEventInvoices,
    );

    return {
      dispatcher,
      cancelEvent,
      chaseOutstanding,
      engagementAnnualRenewal,
      engagementConferenceReminders,
      engagementDistributeForms,
      generateTripPack,
      expirePending,
      generateEventInvoices,
    };
  }

  it.each([
    [CANCEL_EVENT_JOB, 'cancelEvent'],
    [CHASE_OUTSTANDING_JOB, 'chaseOutstanding'],
    [ANNUAL_CONSENT_RENEWAL_JOB, 'engagementAnnualRenewal'],
    [CONFERENCE_REMINDERS_JOB, 'engagementConferenceReminders'],
    [DISTRIBUTE_FORMS_JOB, 'engagementDistributeForms'],
    [GENERATE_TRIP_PACK_JOB, 'generateTripPack'],
    [EXPIRE_PENDING_JOB, 'expirePending'],
    [GENERATE_EVENT_INVOICES_JOB, 'generateEventInvoices'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'cancelEvent',
      'chaseOutstanding',
      'engagementAnnualRenewal',
      'engagementConferenceReminders',
      'engagementDistributeForms',
      'generateTripPack',
      'expirePending',
      'generateEventInvoices',
    ] as const;
    for (const key of targets) {
      const expected = key === targetKey ? 1 : 0;
      expect(harness[key].process).toHaveBeenCalledTimes(expected);
    }
  });

  it('completes unknown job names silently — canary pings depend on this', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-unknown', name: 'monitoring:canary-ping', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });

  it('completes non-canary unknown jobs silently (logs warning)', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-weird', name: 'something:totally-unknown', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });
});
