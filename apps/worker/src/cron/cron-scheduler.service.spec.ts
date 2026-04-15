import type { Queue } from 'bullmq';

import { APPROVAL_CALLBACK_RECONCILIATION_JOB } from '../processors/approvals/callback-reconciliation.processor';
import {
  BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
  BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
  BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
} from '../processors/behaviour/cron-dispatch.processor';
import { BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB } from '../processors/behaviour/notification-reconciliation.processor';
import { BEHAVIOUR_PARTITION_MAINTENANCE_JOB } from '../processors/behaviour/partition-maintenance.processor';
import {
  REFRESH_MV_BENCHMARKS_JOB,
  REFRESH_MV_EXPOSURE_RATES_JOB,
  REFRESH_MV_STUDENT_SUMMARY_JOB,
} from '../processors/behaviour/refresh-mv.processor';
import { IP_CLEANUP_JOB } from '../processors/communications/ip-cleanup.processor';
import { RETRY_FAILED_NOTIFICATIONS_JOB } from '../processors/communications/retry-failed.processor';
import { DEADLINE_CHECK_JOB } from '../processors/compliance/deadline-check.processor';
import { RETENTION_ENFORCEMENT_JOB } from '../processors/compliance/retention-enforcement.processor';
import { CHASE_OUTSTANDING_JOB } from '../processors/engagement/chase-outstanding.processor';
import { ANNUAL_CONSENT_RENEWAL_JOB } from '../processors/engagement/engagement-annual-renewal.processor';
import { CONFERENCE_REMINDERS_JOB } from '../processors/engagement/engagement-conference-reminders.processor';
import { EXPIRE_PENDING_JOB } from '../processors/engagement/expire-pending.processor';
import { GRADEBOOK_DETECT_RISKS_JOB } from '../processors/gradebook/gradebook-risk-detection.processor';
import { REPORT_CARD_AUTO_GENERATE_JOB } from '../processors/gradebook/report-card-auto-generate.processor';
import { HOMEWORK_COMPLETION_REMINDER_JOB } from '../processors/homework/completion-reminder.processor';
import { HOMEWORK_DIGEST_JOB } from '../processors/homework/digest-homework.processor';
import { HOMEWORK_GENERATE_RECURRING_JOB } from '../processors/homework/generate-recurring.processor';
import { HOMEWORK_OVERDUE_DETECTION_JOB } from '../processors/homework/overdue-detection.processor';
import { IMPORT_FILE_CLEANUP_JOB } from '../processors/imports/import-file-cleanup.processor';
import { DLQ_MONITOR_JOB } from '../processors/monitoring/dlq-monitor.processor';
import { DISPATCH_QUEUED_JOB } from '../processors/notifications/dispatch-queued.processor';
import { PARENT_DAILY_DIGEST_JOB } from '../processors/notifications/parent-daily-digest.processor';
import { PASTORAL_CRON_DISPATCH_OVERDUE_JOB } from '../processors/pastoral/pastoral-cron-dispatch.processor';
import { REGULATORY_DEADLINE_CHECK_JOB } from '../processors/regulatory/deadline-check.processor';
import { REGULATORY_TUSLA_THRESHOLD_SCAN_JOB } from '../processors/regulatory/tusla-threshold-scan.processor';
import { ANOMALY_SCAN_JOB } from '../processors/security/anomaly-scan.processor';
import { BREACH_DEADLINE_JOB } from '../processors/security/breach-deadline.processor';
import { CLEANUP_PARTICIPATION_TOKENS_JOB } from '../processors/wellbeing/cleanup-participation-tokens.processor';
import { EAP_REFRESH_CHECK_JOB } from '../processors/wellbeing/eap-refresh-check.processor';
import { SURVEY_CLOSING_REMINDER_JOB } from '../processors/wellbeing/survey-closing-reminder.processor';
import { WORKLOAD_METRICS_JOB } from '../processors/wellbeing/workload-metrics.processor';

import { CronSchedulerService } from './cron-scheduler.service';

const EARLY_WARNING_COMPUTE_DAILY_JOB = 'early-warning:compute-daily';
const EARLY_WARNING_WEEKLY_DIGEST_JOB = 'early-warning:weekly-digest';
const CANARY_PING_JOB = 'monitoring:canary-ping';

function buildQueue(): Queue {
  return {
    add: jest.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

function buildService() {
  const behaviourQueue = buildQueue();
  const gradebookQueue = buildQueue();
  const importsQueue = buildQueue();
  const notificationsQueue = buildQueue();
  const wellbeingQueue = buildQueue();
  const securityQueue = buildQueue();
  const complianceQueue = buildQueue();
  const earlyWarningQueue = buildQueue();
  const homeworkQueue = buildQueue();
  const regulatoryQueue = buildQueue();
  const approvalsQueue = buildQueue();
  const engagementQueue = buildQueue();
  const pastoralQueue = buildQueue();
  const admissionsQueue = buildQueue();
  const financeQueue = buildQueue();
  const schedulingQueue = buildQueue();

  return {
    admissionsQueue,
    approvalsQueue,
    behaviourQueue,
    complianceQueue,
    earlyWarningQueue,
    engagementQueue,
    financeQueue,
    gradebookQueue,
    homeworkQueue,
    importsQueue,
    notificationsQueue,
    pastoralQueue,
    regulatoryQueue,
    securityQueue,
    schedulingQueue,
    service: new CronSchedulerService(
      behaviourQueue,
      gradebookQueue,
      importsQueue,
      notificationsQueue,
      wellbeingQueue,
      securityQueue,
      complianceQueue,
      earlyWarningQueue,
      homeworkQueue,
      regulatoryQueue,
      approvalsQueue,
      engagementQueue,
      pastoralQueue,
      admissionsQueue,
      financeQueue,
      schedulingQueue,
    ),
    wellbeingQueue,
  };
}

describe('CronSchedulerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register both dispatch-queued and retry-failed notification crons', async () => {
    const { notificationsQueue, service } = buildService();

    await service.onModuleInit();

    expect(notificationsQueue.add).toHaveBeenCalledWith(
      DISPATCH_QUEUED_JOB,
      {},
      {
        repeat: { every: 30_000 },
        jobId: `cron:${DISPATCH_QUEUED_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      RETRY_FAILED_NOTIFICATIONS_JOB,
      {},
      {
        repeat: { every: 30_000 },
        jobId: `cron:${RETRY_FAILED_NOTIFICATIONS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
  });

  it('should register the broader repeatable cron set during startup', async () => {
    const {
      approvalsQueue,
      behaviourQueue,
      complianceQueue,
      earlyWarningQueue,
      engagementQueue,
      gradebookQueue,
      homeworkQueue,
      importsQueue,
      notificationsQueue,
      pastoralQueue,
      regulatoryQueue,
      securityQueue,
      service,
      wellbeingQueue,
    } = buildService();

    await service.onModuleInit();

    expect(earlyWarningQueue.add).toHaveBeenCalledWith(
      EARLY_WARNING_COMPUTE_DAILY_JOB,
      {},
      expect.any(Object),
    );
    expect(earlyWarningQueue.add).toHaveBeenCalledWith(
      EARLY_WARNING_WEEKLY_DIGEST_JOB,
      {},
      expect.any(Object),
    );
    expect(gradebookQueue.add).toHaveBeenCalledWith(
      GRADEBOOK_DETECT_RISKS_JOB,
      {},
      expect.any(Object),
    );
    expect(gradebookQueue.add).toHaveBeenCalledWith(
      REPORT_CARD_AUTO_GENERATE_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      REFRESH_MV_STUDENT_SUMMARY_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      REFRESH_MV_EXPOSURE_RATES_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      REFRESH_MV_BENCHMARKS_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
      {},
      expect.any(Object),
    );
    expect(behaviourQueue.add).toHaveBeenCalledWith(
      BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB,
      {},
      expect.any(Object),
    );
    expect(wellbeingQueue.add).toHaveBeenCalledWith(
      CLEANUP_PARTICIPATION_TOKENS_JOB,
      {},
      expect.any(Object),
    );
    expect(wellbeingQueue.add).toHaveBeenCalledWith(EAP_REFRESH_CHECK_JOB, {}, expect.any(Object));
    expect(wellbeingQueue.add).toHaveBeenCalledWith(
      SURVEY_CLOSING_REMINDER_JOB,
      {},
      expect.any(Object),
    );
    expect(wellbeingQueue.add).toHaveBeenCalledWith(WORKLOAD_METRICS_JOB, {}, expect.any(Object));
    expect(importsQueue.add).toHaveBeenCalledWith(IMPORT_FILE_CLEANUP_JOB, {}, expect.any(Object));
    expect(securityQueue.add).toHaveBeenCalledWith(ANOMALY_SCAN_JOB, {}, expect.any(Object));
    expect(securityQueue.add).toHaveBeenCalledWith(BREACH_DEADLINE_JOB, {}, expect.any(Object));
    expect(complianceQueue.add).toHaveBeenCalledWith(
      RETENTION_ENFORCEMENT_JOB,
      {},
      expect.any(Object),
    );
    expect(complianceQueue.add).toHaveBeenCalledWith(DEADLINE_CHECK_JOB, {}, expect.any(Object));
    expect(regulatoryQueue.add).toHaveBeenCalledWith(
      REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
      {},
      expect.any(Object),
    );
    expect(regulatoryQueue.add).toHaveBeenCalledWith(
      REGULATORY_DEADLINE_CHECK_JOB,
      {},
      expect.any(Object),
    );
    expect(homeworkQueue.add).toHaveBeenCalledWith(
      HOMEWORK_GENERATE_RECURRING_JOB,
      {},
      expect.any(Object),
    );
    expect(homeworkQueue.add).toHaveBeenCalledWith(
      HOMEWORK_OVERDUE_DETECTION_JOB,
      {},
      expect.any(Object),
    );
    expect(homeworkQueue.add).toHaveBeenCalledWith(HOMEWORK_DIGEST_JOB, {}, expect.any(Object));
    expect(homeworkQueue.add).toHaveBeenCalledWith(
      HOMEWORK_COMPLETION_REMINDER_JOB,
      {},
      expect.any(Object),
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      PARENT_DAILY_DIGEST_JOB,
      {},
      expect.any(Object),
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(IP_CLEANUP_JOB, {}, expect.any(Object));
    expect(approvalsQueue.add).toHaveBeenCalledWith(
      APPROVAL_CALLBACK_RECONCILIATION_JOB,
      {},
      expect.any(Object),
    );
    expect(engagementQueue.add).toHaveBeenCalledWith(
      ANNUAL_CONSENT_RENEWAL_JOB,
      {},
      expect.any(Object),
    );
    expect(engagementQueue.add).toHaveBeenCalledWith(CHASE_OUTSTANDING_JOB, {}, expect.any(Object));
    expect(engagementQueue.add).toHaveBeenCalledWith(EXPIRE_PENDING_JOB, {}, expect.any(Object));
    expect(engagementQueue.add).toHaveBeenCalledWith(
      CONFERENCE_REMINDERS_JOB,
      {},
      expect.any(Object),
    );
    expect(pastoralQueue.add).toHaveBeenCalledWith(
      PASTORAL_CRON_DISPATCH_OVERDUE_JOB,
      {},
      expect.any(Object),
    );
    expect(notificationsQueue.add).toHaveBeenCalledWith(DLQ_MONITOR_JOB, {}, expect.any(Object));
    expect(notificationsQueue.add).toHaveBeenCalledWith(CANARY_PING_JOB, {}, expect.any(Object));
  });

  // ─── Cron scheduler health tests ────────────────────────────────────────────

  it('should use unique jobId for each cron registration to prevent BullMQ deduplication conflicts', async () => {
    const {
      approvalsQueue,
      behaviourQueue,
      complianceQueue,
      earlyWarningQueue,
      engagementQueue,
      gradebookQueue,
      homeworkQueue,
      importsQueue,
      notificationsQueue,
      pastoralQueue,
      regulatoryQueue,
      securityQueue,
      service,
      wellbeingQueue,
    } = buildService();

    await service.onModuleInit();

    const allQueues = [
      approvalsQueue,
      behaviourQueue,
      complianceQueue,
      earlyWarningQueue,
      engagementQueue,
      gradebookQueue,
      homeworkQueue,
      importsQueue,
      notificationsQueue,
      pastoralQueue,
      regulatoryQueue,
      securityQueue,
      wellbeingQueue,
    ];

    const allJobIds: string[] = [];
    for (const queue of allQueues) {
      const addMock = queue.add as jest.Mock;
      for (const call of addMock.mock.calls) {
        const options = call[2] as { jobId?: string };
        if (options?.jobId) {
          allJobIds.push(options.jobId);
        }
      }
    }

    const uniqueJobIds = new Set(allJobIds);
    expect(allJobIds.length).toBeGreaterThan(0);
    expect(uniqueJobIds.size).toBe(allJobIds.length);
  });

  it('should include removeOnComplete and removeOnFail for all cron registrations', async () => {
    const {
      approvalsQueue,
      behaviourQueue,
      complianceQueue,
      earlyWarningQueue,
      engagementQueue,
      gradebookQueue,
      homeworkQueue,
      importsQueue,
      notificationsQueue,
      pastoralQueue,
      regulatoryQueue,
      securityQueue,
      service,
      wellbeingQueue,
    } = buildService();

    await service.onModuleInit();

    const allQueues = [
      approvalsQueue,
      behaviourQueue,
      complianceQueue,
      earlyWarningQueue,
      engagementQueue,
      gradebookQueue,
      homeworkQueue,
      importsQueue,
      notificationsQueue,
      pastoralQueue,
      regulatoryQueue,
      securityQueue,
      wellbeingQueue,
    ];

    for (const queue of allQueues) {
      const addMock = queue.add as jest.Mock;
      for (const call of addMock.mock.calls) {
        const jobName = call[0] as string;
        const options = call[2] as { removeOnComplete?: number; removeOnFail?: number };
        expect(options.removeOnComplete).toBeDefined();
        expect(options.removeOnFail).toBeDefined();
        expect(typeof options.removeOnComplete).toBe('number');
        expect(typeof options.removeOnFail).toBe('number');
        // Provide context on failure
        if (!options.removeOnComplete || !options.removeOnFail) {
          throw new Error(
            `Cron job "${jobName}" is missing removeOnComplete or removeOnFail — this causes Redis memory leaks`,
          );
        }
      }
    }
  });

  it('should register at least one compliance-affecting cron job on regulatory and compliance queues', async () => {
    const { complianceQueue, regulatoryQueue, service } = buildService();

    await service.onModuleInit();

    const regulatoryAddMock = regulatoryQueue.add as jest.Mock;
    const complianceAddMock = complianceQueue.add as jest.Mock;

    expect(regulatoryAddMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(complianceAddMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
