import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { CronSchedulerService } from './cron-scheduler.service';
import { QUEUE_NAMES, CANARY_PING_JOB } from '../base/queue.constants';
import { EARLY_WARNING_COMPUTE_DAILY_JOB, EARLY_WARNING_WEEKLY_DIGEST_JOB } from '@school/shared';
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

describe('CronSchedulerService', () => {
  let service: CronSchedulerService;

  const createQueueMock = () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  });

  const queues = {
    behaviour: createQueueMock(),
    gradebook: createQueueMock(),
    imports: createQueueMock(),
    notifications: createQueueMock(),
    wellbeing: createQueueMock(),
    security: createQueueMock(),
    compliance: createQueueMock(),
    earlyWarning: createQueueMock(),
    homework: createQueueMock(),
    regulatory: createQueueMock(),
    approvals: createQueueMock(),
    engagement: createQueueMock(),
    pastoral: createQueueMock(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronSchedulerService,
        { provide: getQueueToken(QUEUE_NAMES.BEHAVIOUR), useValue: queues.behaviour },
        { provide: getQueueToken(QUEUE_NAMES.GRADEBOOK), useValue: queues.gradebook },
        { provide: getQueueToken(QUEUE_NAMES.IMPORTS), useValue: queues.imports },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: queues.notifications },
        { provide: getQueueToken(QUEUE_NAMES.WELLBEING), useValue: queues.wellbeing },
        { provide: getQueueToken(QUEUE_NAMES.SECURITY), useValue: queues.security },
        { provide: getQueueToken(QUEUE_NAMES.COMPLIANCE), useValue: queues.compliance },
        { provide: getQueueToken(QUEUE_NAMES.EARLY_WARNING), useValue: queues.earlyWarning },
        { provide: getQueueToken(QUEUE_NAMES.HOMEWORK), useValue: queues.homework },
        { provide: getQueueToken(QUEUE_NAMES.REGULATORY), useValue: queues.regulatory },
        { provide: getQueueToken(QUEUE_NAMES.APPROVALS), useValue: queues.approvals },
        { provide: getQueueToken(QUEUE_NAMES.ENGAGEMENT), useValue: queues.engagement },
        { provide: getQueueToken(QUEUE_NAMES.PASTORAL), useValue: queues.pastoral },
      ],
    }).compile();

    service = module.get<CronSchedulerService>(CronSchedulerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── onModuleInit ────────────────────────────────────────────────────────────
  describe('onModuleInit', () => {
    it('should register all cron job groups on module initialization', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.onModuleInit();

      // Verify at least one job was registered from each major category
      expect(queues.earlyWarning.add).toHaveBeenCalled();
      expect(queues.gradebook.add).toHaveBeenCalled();
      expect(queues.behaviour.add).toHaveBeenCalled();
      expect(queues.notifications.add).toHaveBeenCalled();
      expect(queues.wellbeing.add).toHaveBeenCalled();
      expect(queues.security.add).toHaveBeenCalled();
      expect(queues.compliance.add).toHaveBeenCalled();
      expect(queues.homework.add).toHaveBeenCalled();
      expect(queues.regulatory.add).toHaveBeenCalled();
      expect(queues.approvals.add).toHaveBeenCalled();
      expect(queues.engagement.add).toHaveBeenCalled();
      expect(queues.pastoral.add).toHaveBeenCalled();

      // Verify logging occurred
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  // ─── Early Warning Jobs ──────────────────────────────────────────────────────
  describe('registerEarlyWarningCronJobs', () => {
    it('should register compute-daily job with correct cron pattern', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await (service as any).registerEarlyWarningCronJobs();

      expect(queues.earlyWarning.add).toHaveBeenCalledWith(
        EARLY_WARNING_COMPUTE_DAILY_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 1 * * *' },
          jobId: `cron:${EARLY_WARNING_COMPUTE_DAILY_JOB}`,
          removeOnComplete: 10,
          removeOnFail: 50,
        }),
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(EARLY_WARNING_COMPUTE_DAILY_JOB),
      );
    });

    it('should register weekly-digest job with correct cron pattern', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await (service as any).registerEarlyWarningCronJobs();

      expect(queues.earlyWarning.add).toHaveBeenCalledWith(
        EARLY_WARNING_WEEKLY_DIGEST_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 7 * * *' },
          jobId: `cron:${EARLY_WARNING_WEEKLY_DIGEST_JOB}`,
          removeOnComplete: 10,
          removeOnFail: 50,
        }),
      );
    });
  });

  // ─── Gradebook Jobs ───────────────────────────────────────────────────────────
  describe('registerGradebookCronJobs', () => {
    it('should register detect-risks job', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await (service as any).registerGradebookCronJobs();

      expect(queues.gradebook.add).toHaveBeenCalledWith(
        GRADEBOOK_DETECT_RISKS_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 2 * * *' },
          jobId: `cron:${GRADEBOOK_DETECT_RISKS_JOB}`,
          removeOnComplete: 10,
          removeOnFail: 50,
        }),
      );
    });

    it('should register auto-generate report cards job', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await (service as any).registerGradebookCronJobs();

      expect(queues.gradebook.add).toHaveBeenCalledWith(
        REPORT_CARD_AUTO_GENERATE_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 3 * * *' },
          jobId: `cron:${REPORT_CARD_AUTO_GENERATE_JOB}`,
          removeOnComplete: 10,
          removeOnFail: 50,
        }),
      );
    });
  });

  // ─── Behaviour Jobs ────────────────────────────────────────────────────────────
  describe('registerBehaviourCronJobs', () => {
    it('should register MV refresh jobs with staggered times', async () => {
      await (service as any).registerBehaviourCronJobs();

      // Student summary refresh every 15 minutes
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        REFRESH_MV_STUDENT_SUMMARY_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '*/15 * * * *' },
          jobId: `cron:${REFRESH_MV_STUDENT_SUMMARY_JOB}`,
        }),
      );

      // Exposure rates at 01:30
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        REFRESH_MV_EXPOSURE_RATES_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '30 1 * * *' },
        }),
      );

      // Benchmarks at 02:15
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        REFRESH_MV_BENCHMARKS_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '15 2 * * *' },
        }),
      );
    });

    it('should register partition maintenance job monthly', async () => {
      await (service as any).registerBehaviourCronJobs();

      expect(queues.behaviour.add).toHaveBeenCalledWith(
        BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 0 1 * *' },
          removeOnComplete: 5,
          removeOnFail: 20,
        }),
      );
    });

    it('should register dispatch jobs with various frequencies', async () => {
      await (service as any).registerBehaviourCronJobs();

      // Daily dispatch hourly
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 * * * *' },
        }),
      );

      // SLA check every 5 minutes
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '*/5 * * * *' },
        }),
      );

      // Monthly dispatch first of month
      expect(queues.behaviour.add).toHaveBeenCalledWith(
        BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 1 1 * *' },
          removeOnComplete: 5,
          removeOnFail: 20,
        }),
      );
    });

    it('should register notification reconciliation job', async () => {
      await (service as any).registerBehaviourCronJobs();

      expect(queues.behaviour.add).toHaveBeenCalledWith(
        BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 5 * * *' },
        }),
      );
    });
  });

  // ─── Notifications Jobs ────────────────────────────────────────────────────
  describe('registerNotificationsCronJobs', () => {
    it('should register dispatch-queued job with interval-based repeat', async () => {
      await (service as any).registerNotificationsCronJobs();

      expect(queues.notifications.add).toHaveBeenCalledWith(
        DISPATCH_QUEUED_JOB,
        {},
        expect.objectContaining({
          repeat: { every: 30_000 },
          jobId: `cron:${DISPATCH_QUEUED_JOB}`,
        }),
      );
    });
  });

  // ─── Wellbeing Jobs ──────────────────────────────────────────────────────────
  describe('registerWellbeingCronJobs', () => {
    it('should register all wellbeing maintenance jobs', async () => {
      await (service as any).registerWellbeingCronJobs();

      expect(queues.wellbeing.add).toHaveBeenCalledWith(
        CLEANUP_PARTICIPATION_TOKENS_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 5 * * *' },
        }),
      );

      expect(queues.wellbeing.add).toHaveBeenCalledWith(
        EAP_REFRESH_CHECK_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 6 * * *' },
        }),
      );

      expect(queues.wellbeing.add).toHaveBeenCalledWith(
        SURVEY_CLOSING_REMINDER_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 8 * * *' },
        }),
      );

      expect(queues.wellbeing.add).toHaveBeenCalledWith(
        WORKLOAD_METRICS_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '30 3 * * *' },
        }),
      );
    });
  });

  // ─── Cleanup Jobs ────────────────────────────────────────────────────────────
  describe('registerCleanupCronJobs', () => {
    it('should register IP cleanup job', async () => {
      await (service as any).registerCleanupCronJobs();

      expect(queues.notifications.add).toHaveBeenCalledWith(
        IP_CLEANUP_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 4 * * *' },
        }),
      );
    });

    it('should register file cleanup job', async () => {
      await (service as any).registerCleanupCronJobs();

      expect(queues.imports.add).toHaveBeenCalledWith(
        IMPORT_FILE_CLEANUP_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 5 * * *' },
        }),
      );
    });
  });

  // ─── Security Jobs ───────────────────────────────────────────────────────────
  describe('registerSecurityCronJobs', () => {
    it('should register anomaly scan job every 15 minutes', async () => {
      await (service as any).registerSecurityCronJobs();

      expect(queues.security.add).toHaveBeenCalledWith(
        ANOMALY_SCAN_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '*/15 * * * *' },
        }),
      );
    });

    it('should register breach deadline check hourly', async () => {
      await (service as any).registerSecurityCronJobs();

      expect(queues.security.add).toHaveBeenCalledWith(
        BREACH_DEADLINE_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 * * * *' },
        }),
      );
    });
  });

  // ─── Compliance Jobs ─────────────────────────────────────────────────────────
  describe('registerComplianceCronJobs', () => {
    it('should register retention enforcement weekly', async () => {
      await (service as any).registerComplianceCronJobs();

      expect(queues.compliance.add).toHaveBeenCalledWith(
        RETENTION_ENFORCEMENT_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 3 * * 0' },
        }),
      );
    });

    it('should register deadline check daily', async () => {
      await (service as any).registerComplianceCronJobs();

      expect(queues.compliance.add).toHaveBeenCalledWith(
        DEADLINE_CHECK_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 6 * * *' },
        }),
      );
    });
  });

  // ─── Regulatory Jobs ─────────────────────────────────────────────────────────
  describe('registerRegulatoryCronJobs', () => {
    it('should register Tusla threshold scan job', async () => {
      await (service as any).registerRegulatoryCronJobs();

      expect(queues.regulatory.add).toHaveBeenCalledWith(
        REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 6 * * *' },
        }),
      );
    });

    it('should register deadline check job', async () => {
      await (service as any).registerRegulatoryCronJobs();

      expect(queues.regulatory.add).toHaveBeenCalledWith(
        REGULATORY_DEADLINE_CHECK_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 7 * * *' },
        }),
      );
    });
  });

  // ─── Homework Jobs ────────────────────────────────────────────────────────────
  describe('registerHomeworkCronJobs', () => {
    it('should register all homework jobs at staggered times', async () => {
      await (service as any).registerHomeworkCronJobs();

      expect(queues.homework.add).toHaveBeenCalledWith(
        HOMEWORK_GENERATE_RECURRING_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 5 * * *' },
        }),
      );

      expect(queues.homework.add).toHaveBeenCalledWith(
        HOMEWORK_OVERDUE_DETECTION_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 6 * * *' },
        }),
      );

      expect(queues.homework.add).toHaveBeenCalledWith(
        HOMEWORK_DIGEST_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 7 * * *' },
        }),
      );

      expect(queues.homework.add).toHaveBeenCalledWith(
        HOMEWORK_COMPLETION_REMINDER_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 15 * * *' },
        }),
      );
    });
  });

  // ─── Parent Digest Jobs ───────────────────────────────────────────────────────
  describe('registerParentDigestCronJobs', () => {
    it('should register parent daily digest hourly', async () => {
      await (service as any).registerParentDigestCronJobs();

      expect(queues.notifications.add).toHaveBeenCalledWith(
        PARENT_DAILY_DIGEST_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 * * * *' },
        }),
      );
    });
  });

  // ─── Approvals Jobs ───────────────────────────────────────────────────────────
  describe('registerApprovalsCronJobs', () => {
    it('should register callback reconciliation job', async () => {
      await (service as any).registerApprovalsCronJobs();

      expect(queues.approvals.add).toHaveBeenCalledWith(
        APPROVAL_CALLBACK_RECONCILIATION_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '30 4 * * *' },
        }),
      );
    });
  });

  // ─── Engagement Jobs ────────────────────────────────────────────────────────
  describe('registerEngagementCronJobs', () => {
    it('should register all engagement jobs', async () => {
      await (service as any).registerEngagementCronJobs();

      expect(queues.engagement.add).toHaveBeenCalledWith(
        ANNUAL_CONSENT_RENEWAL_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '15 4 * * *' },
        }),
      );

      expect(queues.engagement.add).toHaveBeenCalledWith(
        CHASE_OUTSTANDING_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 9 * * *' },
        }),
      );

      expect(queues.engagement.add).toHaveBeenCalledWith(
        EXPIRE_PENDING_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 0 * * *' },
        }),
      );

      expect(queues.engagement.add).toHaveBeenCalledWith(
        CONFERENCE_REMINDERS_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 8 * * *' },
        }),
      );
    });
  });

  // ─── Pastoral Jobs ───────────────────────────────────────────────────────────
  describe('registerPastoralCronJobs', () => {
    it('should register overdue actions dispatch hourly', async () => {
      await (service as any).registerPastoralCronJobs();

      expect(queues.pastoral.add).toHaveBeenCalledWith(
        PASTORAL_CRON_DISPATCH_OVERDUE_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 * * * *' },
        }),
      );
    });
  });

  // ─── Monitoring Jobs ────────────────────────────────────────────────────────
  describe('registerMonitoringCronJobs', () => {
    it('should register DLQ monitor every 15 minutes', async () => {
      await (service as any).registerMonitoringCronJobs();

      expect(queues.notifications.add).toHaveBeenCalledWith(
        DLQ_MONITOR_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '*/15 * * * *' },
        }),
      );
    });
  });

  // ─── Canary Jobs ─────────────────────────────────────────────────────────────
  describe('registerCanaryCronJobs', () => {
    it('should register canary ping every 5 minutes', async () => {
      await (service as any).registerCanaryCronJobs();

      expect(queues.notifications.add).toHaveBeenCalledWith(
        CANARY_PING_JOB,
        {},
        expect.objectContaining({
          repeat: { pattern: '*/5 * * * *' },
          jobId: `cron:${CANARY_PING_JOB}`,
        }),
      );
    });
  });
});
