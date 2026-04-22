import { Job } from 'bullmq';

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
import { PastoralQueueDispatcher } from './pastoral-queue.processor';
import { PRECOMPUTE_AGENDA_JOB, PrecomputeAgendaProcessor } from './precompute-agenda.processor';
import {
  SYNC_BEHAVIOUR_SAFEGUARDING_JOB,
  SyncBehaviourSafeguardingProcessor,
} from './sync-behaviour-safeguarding.processor';
import {
  WELLBEING_FLAG_EXPIRY_JOB,
  WellbeingFlagExpiryProcessor,
} from './wellbeing-flag-expiry.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('PastoralQueueDispatcher', () => {
  function buildDispatcher() {
    const checkinAlert = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as CheckinAlertProcessor;
    const escalationTimeout = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EscalationTimeoutProcessor;
    const interventionReviewReminder = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InterventionReviewReminderProcessor;
    const notifyConcern = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotifyConcernProcessor;
    const overdueActions = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as OverdueActionsProcessor;
    const pastoralCronDispatch = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PastoralCronDispatchProcessor;
    const precomputeAgenda = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrecomputeAgendaProcessor;
    const syncBehaviourSafeguarding = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SyncBehaviourSafeguardingProcessor;
    const wellbeingFlagExpiry = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as WellbeingFlagExpiryProcessor;

    const dispatcher = new PastoralQueueDispatcher(
      checkinAlert,
      escalationTimeout,
      interventionReviewReminder,
      notifyConcern,
      overdueActions,
      pastoralCronDispatch,
      precomputeAgenda,
      syncBehaviourSafeguarding,
      wellbeingFlagExpiry,
    );

    return {
      dispatcher,
      checkinAlert,
      escalationTimeout,
      interventionReviewReminder,
      notifyConcern,
      overdueActions,
      pastoralCronDispatch,
      precomputeAgenda,
      syncBehaviourSafeguarding,
      wellbeingFlagExpiry,
    };
  }

  it.each([
    [CHECKIN_ALERT_JOB, 'checkinAlert'],
    [ESCALATION_TIMEOUT_JOB, 'escalationTimeout'],
    [INTERVENTION_REVIEW_REMINDER_JOB, 'interventionReviewReminder'],
    [NOTIFY_CONCERN_JOB, 'notifyConcern'],
    [OVERDUE_ACTIONS_JOB, 'overdueActions'],
    [PASTORAL_CRON_DISPATCH_OVERDUE_JOB, 'pastoralCronDispatch'],
    [PRECOMPUTE_AGENDA_JOB, 'precomputeAgenda'],
    [SYNC_BEHAVIOUR_SAFEGUARDING_JOB, 'syncBehaviourSafeguarding'],
    [WELLBEING_FLAG_EXPIRY_JOB, 'wellbeingFlagExpiry'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'checkinAlert',
      'escalationTimeout',
      'interventionReviewReminder',
      'notifyConcern',
      'overdueActions',
      'pastoralCronDispatch',
      'precomputeAgenda',
      'syncBehaviourSafeguarding',
      'wellbeingFlagExpiry',
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
