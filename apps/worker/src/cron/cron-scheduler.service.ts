import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EARLY_WARNING_COMPUTE_DAILY_JOB, EARLY_WARNING_WEEKLY_DIGEST_JOB } from '@school/shared';

import { CANARY_PING_JOB, QUEUE_NAMES } from '../base/queue.constants';
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

/**
 * Registers BullMQ repeatable (cron) jobs on module startup.
 * Only one instance of each repeatable job key is kept in Redis —
 * BullMQ deduplicates by the jobId (repeatJobKey) automatically.
 */
@Injectable()
export class CronSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CronSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GRADEBOOK) private readonly gradebookQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMPORTS) private readonly importsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WELLBEING) private readonly wellbeingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SECURITY) private readonly securityQueue: Queue,
    @InjectQueue(QUEUE_NAMES.COMPLIANCE) private readonly complianceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,
    @InjectQueue(QUEUE_NAMES.HOMEWORK) private readonly homeworkQueue: Queue,
    @InjectQueue(QUEUE_NAMES.REGULATORY) private readonly regulatoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.APPROVALS) private readonly approvalsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENGAGEMENT) private readonly engagementQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PASTORAL) private readonly pastoralQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerEarlyWarningCronJobs();
    await this.registerGradebookCronJobs();
    await this.registerBehaviourCronJobs();
    await this.registerNotificationsCronJobs();
    await this.registerWellbeingCronJobs();
    await this.registerCleanupCronJobs();
    await this.registerSecurityCronJobs();
    await this.registerComplianceCronJobs();
    await this.registerRegulatoryCronJobs();
    await this.registerHomeworkCronJobs();
    await this.registerParentDigestCronJobs();
    await this.registerApprovalsCronJobs();
    await this.registerEngagementCronJobs();
    await this.registerPastoralCronJobs();
    await this.registerMonitoringCronJobs();
    await this.registerCanaryCronJobs();
  }

  private async registerEarlyWarningCronJobs(): Promise<void> {
    // ── early-warning:compute-daily ───────────────────────────────────────────
    // Runs daily at 01:00 UTC. Cross-tenant — no tenant_id in payload.
    // Iterates all tenants with early_warning enabled.
    await this.earlyWarningQueue.add(
      EARLY_WARNING_COMPUTE_DAILY_JOB,
      {},
      {
        repeat: { pattern: '0 1 * * *' },
        jobId: `cron:${EARLY_WARNING_COMPUTE_DAILY_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${EARLY_WARNING_COMPUTE_DAILY_JOB} (daily 01:00 UTC)`,
    );

    // ── early-warning:weekly-digest ───────────────────────────────────────────
    // Runs daily at 07:00 UTC. Cross-tenant — processor filters by digest_day.
    await this.earlyWarningQueue.add(
      EARLY_WARNING_WEEKLY_DIGEST_JOB,
      {},
      {
        repeat: { pattern: '0 7 * * *' },
        jobId: `cron:${EARLY_WARNING_WEEKLY_DIGEST_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${EARLY_WARNING_WEEKLY_DIGEST_JOB} (daily 07:00 UTC)`,
    );
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
    this.logger.log(
      `Registered repeatable cron: ${REPORT_CARD_AUTO_GENERATE_JOB} (daily 03:00 UTC)`,
    );
  }

  private async registerBehaviourCronJobs(): Promise<void> {
    // ── Cross-tenant MV refreshes ─────────────────────────────────────────────
    // These refresh materialized views across ALL tenants. No tenant_id needed.

    // Refresh student behaviour summary every 15 minutes
    await this.behaviourQueue.add(
      REFRESH_MV_STUDENT_SUMMARY_JOB,
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: `cron:${REFRESH_MV_STUDENT_SUMMARY_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${REFRESH_MV_STUDENT_SUMMARY_JOB} (every 15 min)`);

    // Refresh exposure rates daily at 01:30 UTC (staggered from 02:00 to reduce DB load)
    await this.behaviourQueue.add(
      REFRESH_MV_EXPOSURE_RATES_JOB,
      {},
      {
        repeat: { pattern: '30 1 * * *' },
        jobId: `cron:${REFRESH_MV_EXPOSURE_RATES_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${REFRESH_MV_EXPOSURE_RATES_JOB} (daily 01:30 UTC)`,
    );

    // Refresh benchmarks daily at 02:15 UTC (staggered from 03:00 to reduce DB load)
    await this.behaviourQueue.add(
      REFRESH_MV_BENCHMARKS_JOB,
      {},
      {
        repeat: { pattern: '15 2 * * *' },
        jobId: `cron:${REFRESH_MV_BENCHMARKS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${REFRESH_MV_BENCHMARKS_JOB} (daily 02:15 UTC)`);

    // ── Cross-tenant maintenance ──────────────────────────────────────────────

    // Partition maintenance — monthly on the 1st at 00:00 UTC
    await this.behaviourQueue.add(
      BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
      {},
      {
        repeat: { pattern: '0 0 1 * *' },
        jobId: `cron:${BEHAVIOUR_PARTITION_MAINTENANCE_JOB}`,
        removeOnComplete: 5,
        removeOnFail: 20,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${BEHAVIOUR_PARTITION_MAINTENANCE_JOB} (monthly 1st 00:00 UTC)`,
    );

    // ── Per-tenant dispatchers ────────────────────────────────────────────────
    // These dispatch tenant-specific jobs based on each tenant's configuration.

    // Daily dispatch — runs hourly, checks tenant schedules
    await this.behaviourQueue.add(
      BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: `cron:${BEHAVIOUR_CRON_DISPATCH_DAILY_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${BEHAVIOUR_CRON_DISPATCH_DAILY_JOB} (hourly)`);

    // SLA check dispatch — every 5 minutes
    await this.behaviourQueue.add(
      BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        jobId: `cron:${BEHAVIOUR_CRON_DISPATCH_SLA_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${BEHAVIOUR_CRON_DISPATCH_SLA_JOB} (every 5 min)`);

    // Monthly dispatch — monthly on the 1st at 01:00 UTC
    await this.behaviourQueue.add(
      BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
      {},
      {
        repeat: { pattern: '0 1 1 * *' },
        jobId: `cron:${BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB}`,
        removeOnComplete: 5,
        removeOnFail: 20,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB} (monthly 1st 01:00 UTC)`,
    );

    // ── Notification reconciliation backstop ──────────────────────────────────
    // Daily at 05:00 UTC. Cross-tenant — no tenant_id in payload.
    // Finds incidents with parent_notification_status = 'pending' older than 4
    // hours and re-enqueues behaviour:parent-notification for each one.
    await this.behaviourQueue.add(
      BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB,
      {},
      {
        repeat: { pattern: '0 5 * * *' },
        jobId: `cron:${BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB} (daily 05:00 UTC)`,
    );
  }

  private async registerNotificationsCronJobs(): Promise<void> {
    // ── dispatch-queued ─────────────────────────────────────────────────────
    // Runs every 30 seconds. Cross-tenant — no tenant_id in payload.
    // Polls for queued notifications ready for dispatch and re-enqueues them.
    await this.notificationsQueue.add(
      DISPATCH_QUEUED_JOB,
      {},
      {
        repeat: { every: 30_000 },
        jobId: `cron:${DISPATCH_QUEUED_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${DISPATCH_QUEUED_JOB} (every 30s)`);
  }

  private async registerWellbeingCronJobs(): Promise<void> {
    // ── wellbeing:cleanup-participation-tokens ──────────────────────────────
    // Runs daily at 05:00 UTC. Deletes participation tokens for surveys
    // closed >7 days ago — makes anonymity architectural.
    await this.wellbeingQueue.add(
      CLEANUP_PARTICIPATION_TOKENS_JOB,
      {},
      {
        repeat: { pattern: '0 5 * * *' },
        jobId: `cron:${CLEANUP_PARTICIPATION_TOKENS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${CLEANUP_PARTICIPATION_TOKENS_JOB} (daily 05:00 UTC)`,
    );

    // ── wellbeing:eap-refresh-check ─────────────────────────────────────────
    // Runs daily at 06:00 UTC. Notifies managers if EAP details are >90 days stale.
    await this.wellbeingQueue.add(
      EAP_REFRESH_CHECK_JOB,
      {},
      {
        repeat: { pattern: '0 6 * * *' },
        jobId: `cron:${EAP_REFRESH_CHECK_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${EAP_REFRESH_CHECK_JOB} (daily 06:00 UTC)`);

    // ── wellbeing:survey-closing-reminder ────────────────────────────────────
    // Runs daily at 08:00 UTC. Reminds staff when a survey closes within 24h.
    await this.wellbeingQueue.add(
      SURVEY_CLOSING_REMINDER_JOB,
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        jobId: `cron:${SURVEY_CLOSING_REMINDER_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${SURVEY_CLOSING_REMINDER_JOB} (daily 08:00 UTC)`);

    // ── wellbeing:compute-workload-metrics ─────────────────────────────────
    // Runs daily at 03:30 UTC (staggered from 04:00 to reduce DB load).
    // Pre-computes all aggregate workload metrics for each tenant with
    // staff_wellbeing enabled and caches in Redis (24h TTL).
    await this.wellbeingQueue.add(
      WORKLOAD_METRICS_JOB,
      {},
      {
        repeat: { pattern: '30 3 * * *' },
        jobId: `cron:${WORKLOAD_METRICS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${WORKLOAD_METRICS_JOB} (daily 03:30 UTC)`);
  }

  private async registerCleanupCronJobs(): Promise<void> {
    // ── communications:ip-cleanup ───────────────────────────────────────────
    // Runs daily at 04:00 UTC. Cross-tenant — no tenant_id in payload.
    // NULLs source_ip on contact_form_submissions older than 90 days.
    await this.notificationsQueue.add(
      IP_CLEANUP_JOB,
      {},
      {
        repeat: { pattern: '0 4 * * *' },
        jobId: `cron:${IP_CLEANUP_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${IP_CLEANUP_JOB} (daily 04:00 UTC)`);

    // ── imports:file-cleanup ────────────────────────────────────────────────
    // Runs daily at 05:00 UTC. Cross-tenant — no tenant_id in payload.
    // Deletes S3 files for completed/failed imports older than 24 hours.
    await this.importsQueue.add(
      IMPORT_FILE_CLEANUP_JOB,
      {},
      {
        repeat: { pattern: '0 5 * * *' },
        jobId: `cron:${IMPORT_FILE_CLEANUP_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${IMPORT_FILE_CLEANUP_JOB} (daily 05:00 UTC)`);
  }

  private async registerSecurityCronJobs(): Promise<void> {
    // ── security:anomaly-scan ──────────────────────────────────────────────
    // Runs every 15 minutes. Platform-level — no tenant_id in payload.
    // Scans audit_logs for anomalous patterns and creates/updates security incidents.
    await this.securityQueue.add(
      ANOMALY_SCAN_JOB,
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: `cron:${ANOMALY_SCAN_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${ANOMALY_SCAN_JOB} (every 15 min)`);

    // ── security:breach-deadline ───────────────────────────────────────────
    // Runs hourly. Platform-level — no tenant_id in payload.
    // Monitors open high/critical incidents for 72-hour DPC notification deadline.
    await this.securityQueue.add(
      BREACH_DEADLINE_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: `cron:${BREACH_DEADLINE_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${BREACH_DEADLINE_JOB} (hourly)`);
  }

  private async registerComplianceCronJobs(): Promise<void> {
    // ── data-retention:enforce ─────────────────────────────────────────────
    // Runs weekly on Sunday at 03:00 UTC. Cross-tenant — no tenant_id in payload.
    // Iterates all active tenants, resolves effective retention policies,
    // and enforces expiry through anonymisation or deletion.
    await this.complianceQueue.add(
      RETENTION_ENFORCEMENT_JOB,
      {},
      {
        repeat: { pattern: '0 3 * * 0' },
        jobId: `cron:${RETENTION_ENFORCEMENT_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${RETENTION_ENFORCEMENT_JOB} (weekly Sunday 03:00 UTC)`,
    );

    // ── compliance:deadline-check ─────────────────────────────────────────
    // Runs daily at 06:00 UTC. Cross-tenant — no tenant_id in payload.
    // Checks all open compliance requests for approaching/exceeded deadlines
    // and sends notification warnings at 7-day, 3-day, and exceeded marks.
    await this.complianceQueue.add(
      DEADLINE_CHECK_JOB,
      {},
      {
        repeat: { pattern: '0 6 * * *' },
        jobId: `cron:${DEADLINE_CHECK_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${DEADLINE_CHECK_JOB} (daily 06:00 UTC)`);
  }

  private async registerRegulatoryCronJobs(): Promise<void> {
    // ── regulatory:scan-tusla-thresholds ─────────────────────────────────────
    // Runs daily at 06:00 UTC. Cross-tenant — no tenant_id in payload.
    // Scans cumulative absence counts against the Tusla 20-day threshold.
    // Creates AttendancePatternAlert records for approaching/exceeded students.
    await this.regulatoryQueue.add(
      REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
      {},
      {
        repeat: { pattern: '0 6 * * *' },
        jobId: `cron:${REGULATORY_TUSLA_THRESHOLD_SCAN_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${REGULATORY_TUSLA_THRESHOLD_SCAN_JOB} (daily 06:00 UTC)`,
    );

    // ── regulatory:check-deadlines ───────────────────────────────────────────
    // Runs daily at 07:00 UTC. Cross-tenant — no tenant_id in payload.
    // Checks regulatory calendar events for approaching deadlines based on
    // each event's reminder_days configuration. Creates in-app notifications.
    await this.regulatoryQueue.add(
      REGULATORY_DEADLINE_CHECK_JOB,
      {},
      {
        repeat: { pattern: '0 7 * * *' },
        jobId: `cron:${REGULATORY_DEADLINE_CHECK_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${REGULATORY_DEADLINE_CHECK_JOB} (daily 07:00 UTC)`,
    );
  }

  private async registerHomeworkCronJobs(): Promise<void> {
    // ── homework:generate-recurring ──────────────────────────────────────
    // Runs daily at 05:00 UTC. Cross-tenant — no tenant_id in payload.
    // Generates draft homework from active recurrence rules.
    await this.homeworkQueue.add(
      HOMEWORK_GENERATE_RECURRING_JOB,
      {},
      {
        repeat: { pattern: '0 5 * * *' },
        jobId: `cron:${HOMEWORK_GENERATE_RECURRING_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${HOMEWORK_GENERATE_RECURRING_JOB} (daily 05:00 UTC)`,
    );

    // ── homework:overdue-detection ───────────────────────────────────────
    // Runs daily at 06:00 UTC. Cross-tenant — no tenant_id in payload.
    // Notifies parents of overdue homework.
    await this.homeworkQueue.add(
      HOMEWORK_OVERDUE_DETECTION_JOB,
      {},
      {
        repeat: { pattern: '0 6 * * *' },
        jobId: `cron:${HOMEWORK_OVERDUE_DETECTION_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${HOMEWORK_OVERDUE_DETECTION_JOB} (daily 06:00 UTC)`,
    );

    // ── homework:digest-homework ────────────────────────────────────────
    // Runs daily at 07:00 UTC. Cross-tenant — no tenant_id in payload.
    // Sends daily homework digest notifications to parents.
    await this.homeworkQueue.add(
      HOMEWORK_DIGEST_JOB,
      {},
      {
        repeat: { pattern: '0 7 * * *' },
        jobId: `cron:${HOMEWORK_DIGEST_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${HOMEWORK_DIGEST_JOB} (daily 07:00 UTC)`);

    // ── homework:completion-reminder ────────────────────────────────────
    // Runs daily at 15:00 UTC. Cross-tenant — no tenant_id in payload.
    // Reminds students of upcoming homework deadlines.
    await this.homeworkQueue.add(
      HOMEWORK_COMPLETION_REMINDER_JOB,
      {},
      {
        repeat: { pattern: '0 15 * * *' },
        jobId: `cron:${HOMEWORK_COMPLETION_REMINDER_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${HOMEWORK_COMPLETION_REMINDER_JOB} (daily 15:00 UTC)`,
    );
  }

  private async registerParentDigestCronJobs(): Promise<void> {
    // ── notifications:parent-daily-digest ───────────────────────────────
    // Runs hourly. Cross-tenant — no tenant_id in payload.
    // Iterates all active tenants; each tenant's send_hour_utc setting
    // determines whether the digest is generated in this run.
    await this.notificationsQueue.add(
      PARENT_DAILY_DIGEST_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: `cron:${PARENT_DAILY_DIGEST_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${PARENT_DAILY_DIGEST_JOB} (hourly)`);
  }

  private async registerApprovalsCronJobs(): Promise<void> {
    // ── approvals:callback-reconciliation ────────────────────────────────
    // Runs daily at 04:30 UTC. Cross-tenant — no tenant_id in payload.
    // Scans for approved requests where callback hasn't executed and retries them.
    await this.approvalsQueue.add(
      APPROVAL_CALLBACK_RECONCILIATION_JOB,
      {},
      {
        repeat: { pattern: '30 4 * * *' },
        jobId: `cron:${APPROVAL_CALLBACK_RECONCILIATION_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Registered repeatable cron: ${APPROVAL_CALLBACK_RECONCILIATION_JOB} (daily 04:30 UTC)`,
    );
  }

  private async registerEngagementCronJobs(): Promise<void> {
    // ── engagement:annual-consent-renewal ───────────────────────────────────
    // Runs daily at 04:15 UTC. Cross-tenant — processor checks whether a
    // tenant has crossed into a new active academic year and renews annual
    // consent submissions only when prior-year consents have expired.
    await this.engagementQueue.add(
      ANNUAL_CONSENT_RENEWAL_JOB,
      {},
      {
        repeat: { pattern: '15 4 * * *' },
        jobId: `cron:${ANNUAL_CONSENT_RENEWAL_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${ANNUAL_CONSENT_RENEWAL_JOB} (daily 04:15 UTC)`);

    // ── engagement:chase-outstanding ────────────────────────────────────────
    // Runs daily at 09:00 UTC. Cross-tenant — no tenant_id in payload.
    // Iterates all tenants, finds events/forms with pending submissions
    // within configured reminder thresholds and dispatches reminders.
    await this.engagementQueue.add(
      CHASE_OUTSTANDING_JOB,
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        jobId: `cron:${CHASE_OUTSTANDING_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${CHASE_OUTSTANDING_JOB} (daily 09:00 UTC)`);

    // ── engagement:expire-pending ──────────────────────────────────────────
    // Runs daily at 00:00 UTC. Cross-tenant — no tenant_id in payload.
    // Finds pending submissions past their deadline and transitions to expired.
    await this.engagementQueue.add(
      EXPIRE_PENDING_JOB,
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: `cron:${EXPIRE_PENDING_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${EXPIRE_PENDING_JOB} (daily 00:00 UTC)`);

    // ── engagement:conference-reminders ──────────────────────────────────────
    // Runs daily at 08:00 UTC. Cross-tenant — no tenant_id in payload.
    // Sends reminders for conference bookings in the next 24 hours.
    await this.engagementQueue.add(
      CONFERENCE_REMINDERS_JOB,
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        jobId: `cron:${CONFERENCE_REMINDERS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${CONFERENCE_REMINDERS_JOB} (daily 08:00 UTC)`);
  }

  private async registerPastoralCronJobs(): Promise<void> {
    // ── pastoral:cron-dispatch-overdue ──────────────────────────────────────
    // Runs hourly. Cross-tenant — no tenant_id in payload.
    // Dispatches per-tenant pastoral:overdue-actions jobs to detect
    // missed escalations for safeguarding concerns (DZ-36 backstop).
    await this.pastoralQueue.add(
      PASTORAL_CRON_DISPATCH_OVERDUE_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: `cron:${PASTORAL_CRON_DISPATCH_OVERDUE_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${PASTORAL_CRON_DISPATCH_OVERDUE_JOB} (hourly)`);
  }

  private async registerMonitoringCronJobs(): Promise<void> {
    // ── monitoring:dlq-scan ────────────────────────────────────────────────
    // Runs every 15 minutes. Platform-level — no tenant_id in payload.
    // Scans all 20 queues for non-zero failed job counts and alerts via Sentry.
    await this.notificationsQueue.add(
      DLQ_MONITOR_JOB,
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: `cron:${DLQ_MONITOR_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${DLQ_MONITOR_JOB} (every 15 min)`);
  }

  private async registerCanaryCronJobs(): Promise<void> {
    // ── monitoring:canary-ping ─────────────────────────────────────────────
    // Runs every 5 minutes. Platform-level — no tenant_id in payload.
    // Emits a lightweight heartbeat to verify the worker process is alive.
    await this.notificationsQueue.add(
      CANARY_PING_JOB,
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        jobId: `cron:${CANARY_PING_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${CANARY_PING_JOB} (every 5 minutes)`);
  }
}
