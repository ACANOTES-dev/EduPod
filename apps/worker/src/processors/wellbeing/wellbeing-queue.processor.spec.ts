import { Job } from 'bullmq';

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
import { WellbeingQueueDispatcher } from './wellbeing-queue.processor';
import { WORKLOAD_METRICS_JOB, WorkloadMetricsProcessor } from './workload-metrics.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('WellbeingQueueDispatcher', () => {
  function buildDispatcher() {
    const cleanupParticipationTokens = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as CleanupParticipationTokensProcessor;
    const eapRefreshCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EapRefreshCheckProcessor;
    const moderationScan = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ModerationScanProcessor;
    const surveyClosingReminder = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SurveyClosingReminderProcessor;
    const surveyOpenNotify = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SurveyOpenNotifyProcessor;
    const workloadMetrics = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkloadMetricsProcessor;

    const dispatcher = new WellbeingQueueDispatcher(
      cleanupParticipationTokens,
      eapRefreshCheck,
      moderationScan,
      surveyClosingReminder,
      surveyOpenNotify,
      workloadMetrics,
    );

    return {
      dispatcher,
      cleanupParticipationTokens,
      eapRefreshCheck,
      moderationScan,
      surveyClosingReminder,
      surveyOpenNotify,
      workloadMetrics,
    };
  }

  it.each([
    [CLEANUP_PARTICIPATION_TOKENS_JOB, 'cleanupParticipationTokens'],
    [EAP_REFRESH_CHECK_JOB, 'eapRefreshCheck'],
    [MODERATION_SCAN_JOB, 'moderationScan'],
    [SURVEY_CLOSING_REMINDER_JOB, 'surveyClosingReminder'],
    [SURVEY_OPEN_NOTIFY_JOB, 'surveyOpenNotify'],
    [WORKLOAD_METRICS_JOB, 'workloadMetrics'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'cleanupParticipationTokens',
      'eapRefreshCheck',
      'moderationScan',
      'surveyClosingReminder',
      'surveyOpenNotify',
      'workloadMetrics',
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
