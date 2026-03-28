import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import {
  BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
  BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
  BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
} from '../processors/behaviour/cron-dispatch.processor';
import { BEHAVIOUR_PARTITION_MAINTENANCE_JOB } from '../processors/behaviour/partition-maintenance.processor';
import {
  REFRESH_MV_BENCHMARKS_JOB,
  REFRESH_MV_EXPOSURE_RATES_JOB,
  REFRESH_MV_STUDENT_SUMMARY_JOB,
} from '../processors/behaviour/refresh-mv.processor';
import { IP_CLEANUP_JOB } from '../processors/communications/ip-cleanup.processor';
import { DEADLINE_CHECK_JOB } from '../processors/compliance/deadline-check.processor';
import { RETENTION_ENFORCEMENT_JOB } from '../processors/compliance/retention-enforcement.processor';
import { GRADEBOOK_DETECT_RISKS_JOB } from '../processors/gradebook/gradebook-risk-detection.processor';
import { REPORT_CARD_AUTO_GENERATE_JOB } from '../processors/gradebook/report-card-auto-generate.processor';
import { IMPORT_FILE_CLEANUP_JOB } from '../processors/imports/import-file-cleanup.processor';
import { DISPATCH_QUEUED_JOB } from '../processors/notifications/dispatch-queued.processor';
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerGradebookCronJobs();
    await this.registerBehaviourCronJobs();
    await this.registerNotificationsCronJobs();
    await this.registerWellbeingCronJobs();
    await this.registerCleanupCronJobs();
    await this.registerSecurityCronJobs();
    await this.registerComplianceCronJobs();
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

    // Refresh exposure rates daily at 02:00 UTC
    await this.behaviourQueue.add(
      REFRESH_MV_EXPOSURE_RATES_JOB,
      {},
      {
        repeat: { pattern: '0 2 * * *' },
        jobId: `cron:${REFRESH_MV_EXPOSURE_RATES_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${REFRESH_MV_EXPOSURE_RATES_JOB} (daily 02:00 UTC)`);

    // Refresh benchmarks daily at 03:00 UTC
    await this.behaviourQueue.add(
      REFRESH_MV_BENCHMARKS_JOB,
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: `cron:${REFRESH_MV_BENCHMARKS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${REFRESH_MV_BENCHMARKS_JOB} (daily 03:00 UTC)`);

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
    this.logger.log(`Registered repeatable cron: ${BEHAVIOUR_PARTITION_MAINTENANCE_JOB} (monthly 1st 00:00 UTC)`);

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
    this.logger.log(`Registered repeatable cron: ${BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB} (monthly 1st 01:00 UTC)`);
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
    this.logger.log(`Registered repeatable cron: ${CLEANUP_PARTICIPATION_TOKENS_JOB} (daily 05:00 UTC)`);

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
    // Runs daily at 04:00 UTC. Pre-computes all aggregate workload metrics
    // for each tenant with staff_wellbeing enabled and caches in Redis (24h TTL).
    await this.wellbeingQueue.add(
      WORKLOAD_METRICS_JOB,
      {},
      {
        repeat: { pattern: '0 4 * * *' },
        jobId: `cron:${WORKLOAD_METRICS_JOB}`,
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Registered repeatable cron: ${WORKLOAD_METRICS_JOB} (daily 04:00 UTC)`);
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
    this.logger.log(`Registered repeatable cron: ${RETENTION_ENFORCEMENT_JOB} (weekly Sunday 03:00 UTC)`);

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
}
