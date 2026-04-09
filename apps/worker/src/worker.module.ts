import { BullModule } from '@nestjs/bullmq';
import { BeforeApplicationShutdown, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { QUEUE_NAMES } from './base/queue.constants';
import { CronSchedulerService } from './cron/cron-scheduler.service';
import { envValidation } from './env.validation';
import { WorkerHealthController } from './health/worker-health.controller';
import { WorkerHealthService } from './health/worker-health.service';
import { AdmissionsAutoExpiryProcessor } from './processors/admissions-auto-expiry.processor';
import { ApprovalCallbackReconciliationProcessor } from './processors/approvals/callback-reconciliation.processor';
import { AttendanceAutoLockProcessor } from './processors/attendance-auto-lock.processor';
import { AttendancePatternDetectionProcessor } from './processors/attendance-pattern-detection.processor';
import { AttendancePendingDetectionProcessor } from './processors/attendance-pending-detection.processor';
import { AttendanceSessionGenerationProcessor } from './processors/attendance-session-generation.processor';
import { AuditLogWriteProcessor } from './processors/audit-log/audit-log-write.processor';
import { BehaviourCheckAwardsProcessor } from './processors/behaviour/check-awards.processor';
import { BehaviourCronDispatchProcessor } from './processors/behaviour/cron-dispatch.processor';
import { DetectPatternsProcessor } from './processors/behaviour/detect-patterns.processor';
import { DigestNotificationsProcessor } from './processors/behaviour/digest-notifications.processor';
import { DocumentReadyProcessor } from './processors/behaviour/document-ready.processor';
import { EvaluatePolicyProcessor } from './processors/behaviour/evaluate-policy.processor';
import { BehaviourGuardianRestrictionCheckProcessor } from './processors/behaviour/guardian-restriction-check.processor';
import { NotificationReconciliationProcessor } from './processors/behaviour/notification-reconciliation.processor';
import { BehaviourParentNotificationProcessor } from './processors/behaviour/parent-notification.processor';
import { PartitionMaintenanceProcessor } from './processors/behaviour/partition-maintenance.processor';
import { RefreshMVProcessor } from './processors/behaviour/refresh-mv.processor';
import { RetentionCheckProcessor } from './processors/behaviour/retention-check.processor';
import { BehaviourSuspensionReturnProcessor } from './processors/behaviour/suspension-return.processor';
import { BehaviourTaskRemindersProcessor } from './processors/behaviour/task-reminders.processor';
import { AnnouncementApprovalCallbackProcessor } from './processors/communications/announcement-approval-callback.processor';
import { DispatchNotificationsProcessor } from './processors/communications/dispatch-notifications.processor';
import { InquiryNotificationProcessor } from './processors/communications/inquiry-notification.processor';
import { IpCleanupProcessor } from './processors/communications/ip-cleanup.processor';
import { PublishAnnouncementProcessor } from './processors/communications/publish-announcement.processor';
import { RetryFailedNotificationsProcessor } from './processors/communications/retry-failed.processor';
import { StaleInquiryDetectionProcessor } from './processors/communications/stale-inquiry-detection.processor';
import { ComplianceExecutionProcessor } from './processors/compliance/compliance-execution.processor';
import { DeadlineCheckProcessor } from './processors/compliance/deadline-check.processor';
import { RetentionEnforcementProcessor } from './processors/compliance/retention-enforcement.processor';
import { ComputeDailyProcessor } from './processors/early-warning/compute-daily.processor';
import { ComputeStudentProcessor } from './processors/early-warning/compute-student.processor';
import { WeeklyDigestProcessor } from './processors/early-warning/weekly-digest.processor';
import { CancelEventProcessor } from './processors/engagement/cancel-event.processor';
import { ChaseOutstandingProcessor } from './processors/engagement/chase-outstanding.processor';
import { EngagementAnnualRenewalProcessor } from './processors/engagement/engagement-annual-renewal.processor';
import { EngagementConferenceRemindersProcessor } from './processors/engagement/engagement-conference-reminders.processor';
import { EngagementDistributeFormsProcessor } from './processors/engagement/engagement-distribute-forms.processor';
import { GenerateTripPackProcessor } from './processors/engagement/engagement-generate-trip-pack.processor';
import { ExpirePendingProcessor } from './processors/engagement/expire-pending.processor';
import { GenerateEventInvoicesProcessor } from './processors/engagement/generate-invoices.processor';
import { InvoiceApprovalCallbackProcessor } from './processors/finance/invoice-approval-callback.processor';
import { OverdueDetectionProcessor } from './processors/finance/overdue-detection.processor';
import { BulkImportProcessor } from './processors/gradebook/bulk-import.processor';
import { GradebookRiskDetectionProcessor } from './processors/gradebook/gradebook-risk-detection.processor';
import { MassReportCardPdfProcessor } from './processors/gradebook/mass-report-card-pdf.processor';
import { ReportCardAutoGenerateProcessor } from './processors/gradebook/report-card-auto-generate.processor';
import {
  NullReportCardStorageWriter,
  REPORT_CARD_STORAGE_WRITER_TOKEN,
  ReportCardGenerationProcessor,
} from './processors/gradebook/report-card-generation.processor';
import { HomeworkCompletionReminderProcessor } from './processors/homework/completion-reminder.processor';
import { HomeworkDigestProcessor } from './processors/homework/digest-homework.processor';
import { HomeworkGenerateRecurringProcessor } from './processors/homework/generate-recurring.processor';
import { HomeworkOverdueDetectionProcessor } from './processors/homework/overdue-detection.processor';
import { ImportFileCleanupProcessor } from './processors/imports/import-file-cleanup.processor';
import { ImportProcessingProcessor } from './processors/imports/import-processing.processor';
import { ImportValidationProcessor } from './processors/imports/import-validation.processor';
import { CanaryProcessor } from './processors/monitoring/canary.processor';
import { DlqMonitorProcessor } from './processors/monitoring/dlq-monitor.processor';
import { DispatchQueuedProcessor } from './processors/notifications/dispatch-queued.processor';
import { ParentDailyDigestProcessor } from './processors/notifications/parent-daily-digest.processor';
import { CheckinAlertProcessor } from './processors/pastoral/checkin-alert.processor';
import { EscalationTimeoutProcessor } from './processors/pastoral/escalation-timeout.processor';
import { InterventionReviewReminderProcessor } from './processors/pastoral/intervention-review-reminder.processor';
import { NotifyConcernProcessor } from './processors/pastoral/notify-concern.processor';
import { OverdueActionsProcessor } from './processors/pastoral/overdue-actions.processor';
import { PastoralCronDispatchProcessor } from './processors/pastoral/pastoral-cron-dispatch.processor';
import { PrecomputeAgendaProcessor } from './processors/pastoral/precompute-agenda.processor';
import { SyncBehaviourSafeguardingProcessor } from './processors/pastoral/sync-behaviour-safeguarding.processor';
import { WellbeingFlagExpiryProcessor } from './processors/pastoral/wellbeing-flag-expiry.processor';
import { PayrollApprovalCallbackProcessor } from './processors/payroll/approval-callback.processor';
import { PayrollMassExportProcessor } from './processors/payroll/mass-export.processor';
import { PayrollSessionGenerationProcessor } from './processors/payroll/session-generation.processor';
import { PdfRenderProcessor } from './processors/pdf-rendering/pdf-render.processor';
import { RegulatoryDeadlineCheckProcessor } from './processors/regulatory/deadline-check.processor';
import { RegulatoryDesGenerateProcessor } from './processors/regulatory/des-returns-generate.processor';
import { RegulatoryPpodImportProcessor } from './processors/regulatory/ppod-import.processor';
import { RegulatoryPpodSyncProcessor } from './processors/regulatory/ppod-sync.processor';
import { RegulatoryTuslaThresholdScanProcessor } from './processors/regulatory/tusla-threshold-scan.processor';
import { REPORT_CARD_RENDERER_TOKEN } from './processors/report-card-render.contract';
import { PlaceholderReportCardRenderer } from './processors/report-card-render.placeholder';
import { AttachmentScanProcessor } from './processors/safeguarding/attachment-scan.processor';
import { BreakGlassExpiryProcessor } from './processors/safeguarding/break-glass-expiry.processor';
import { CriticalEscalationProcessor } from './processors/safeguarding/critical-escalation.processor';
import { SlaCheckProcessor } from './processors/safeguarding/sla-check.processor';
import { SchedulingSolverV2Processor } from './processors/scheduling/solver-v2.processor';
import { SchedulingStaleReaperProcessor } from './processors/scheduling-stale-reaper.processor';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { SearchReindexProcessor } from './processors/search-reindex.processor';
import { AnomalyScanProcessor } from './processors/security/anomaly-scan.processor';
import { BreachDeadlineProcessor } from './processors/security/breach-deadline.processor';
import { KeyRotationProcessor } from './processors/security/key-rotation.processor';
import { CleanupParticipationTokensProcessor } from './processors/wellbeing/cleanup-participation-tokens.processor';
import { EapRefreshCheckProcessor } from './processors/wellbeing/eap-refresh-check.processor';
import { ModerationScanProcessor } from './processors/wellbeing/moderation-scan.processor';
import { SurveyClosingReminderProcessor } from './processors/wellbeing/survey-closing-reminder.processor';
import { SurveyOpenNotifyProcessor } from './processors/wellbeing/survey-open-notify.processor';
import { WorkloadMetricsProcessor } from './processors/wellbeing/workload-metrics.processor';
import { ClamavScannerService } from './services/clamav-scanner.service';

const DEFAULT_WORKER_SHUTDOWN_GRACE_MS = 30000;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: envValidation,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:5554'));
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password ? decodeURIComponent(url.password) : undefined,
          },
        };
      },
    }),
    // Register all queues with retry/backoff configuration
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.AUDIT_LOG,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      },
      {
        name: QUEUE_NAMES.APPROVALS,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      },
      {
        name: QUEUE_NAMES.PAYROLL,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.NOTIFICATIONS,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 200,
          removeOnFail: 1000,
        },
      },
      {
        name: QUEUE_NAMES.SEARCH_SYNC,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.REPORTS,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.ATTENDANCE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.SCHEDULING,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.GRADEBOOK,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.HOMEWORK,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.FINANCE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.IMPORTS,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.ADMISSIONS,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.BEHAVIOUR,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.PASTORAL,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.PDF_RENDERING,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.SECURITY,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      },
      {
        name: QUEUE_NAMES.WELLBEING,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.COMPLIANCE,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      },
      {
        name: QUEUE_NAMES.REGULATORY,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
      {
        name: QUEUE_NAMES.EARLY_WARNING,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE_NAMES.ENGAGEMENT,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    ),
  ],
  controllers: [WorkerHealthController],
  providers: [
    // Shared PrismaClient instance for all job processors
    {
      provide: 'PRISMA_CLIENT',
      useFactory: async () => {
        const client = new PrismaClient();
        await client.$connect();
        return client;
      },
    },
    // Shared services
    ClamavScannerService,
    // Health service
    WorkerHealthService,
    // Audit log queue processors
    AuditLogWriteProcessor,
    // Approvals queue processors
    ApprovalCallbackReconciliationProcessor,
    // Admissions queue processors
    AdmissionsAutoExpiryProcessor,
    // Behaviour queue processors
    BehaviourCronDispatchProcessor,
    BehaviourParentNotificationProcessor,
    DocumentReadyProcessor,
    NotificationReconciliationProcessor,
    DigestNotificationsProcessor,
    BehaviourTaskRemindersProcessor,
    BehaviourCheckAwardsProcessor,
    BehaviourGuardianRestrictionCheckProcessor,
    EvaluatePolicyProcessor,
    BehaviourSuspensionReturnProcessor,
    // Safeguarding processors (Phase D)
    AttachmentScanProcessor,
    BreakGlassExpiryProcessor,
    SlaCheckProcessor,
    CriticalEscalationProcessor,
    // Phase F: Analytics + AI processors
    DetectPatternsProcessor,
    RefreshMVProcessor,
    // Phase H: Hardening + Ops processors
    RetentionCheckProcessor,
    PartitionMaintenanceProcessor,
    // Search queue processors
    SearchIndexProcessor,
    SearchReindexProcessor,
    // Attendance queue processors
    AttendanceSessionGenerationProcessor,
    AttendancePendingDetectionProcessor,
    AttendanceAutoLockProcessor,
    AttendancePatternDetectionProcessor,
    // Scheduling queue processors
    SchedulingSolverV2Processor,
    SchedulingStaleReaperProcessor,
    // Gradebook queue processors
    MassReportCardPdfProcessor,
    BulkImportProcessor,
    GradebookRiskDetectionProcessor,
    ReportCardAutoGenerateProcessor,
    ReportCardGenerationProcessor,
    // Report Cards Redesign — renderer + storage writer bindings (impl 04)
    // Placeholder renderer is swapped for the production React-PDF template
    // in impl 11. The Null storage writer is swapped for an S3-backed
    // writer in the worker bootstrap when credentials are available.
    PlaceholderReportCardRenderer,
    { provide: REPORT_CARD_RENDERER_TOKEN, useExisting: PlaceholderReportCardRenderer },
    { provide: REPORT_CARD_STORAGE_WRITER_TOKEN, useClass: NullReportCardStorageWriter },
    // Cron scheduler — registers repeatable BullMQ jobs on startup
    CronSchedulerService,
    // Finance queue processors
    OverdueDetectionProcessor,
    InvoiceApprovalCallbackProcessor,
    // Imports queue processors
    ImportValidationProcessor,
    ImportProcessingProcessor,
    ImportFileCleanupProcessor,
    // Compliance processors
    ComplianceExecutionProcessor,
    DeadlineCheckProcessor,
    RetentionEnforcementProcessor,
    // Payroll queue processors
    PayrollSessionGenerationProcessor,
    PayrollMassExportProcessor,
    PayrollApprovalCallbackProcessor,
    // Communications / Notifications queue processors
    PublishAnnouncementProcessor,
    DispatchNotificationsProcessor,
    DispatchQueuedProcessor,
    ParentDailyDigestProcessor,
    RetryFailedNotificationsProcessor,
    InquiryNotificationProcessor,
    StaleInquiryDetectionProcessor,
    IpCleanupProcessor,
    AnnouncementApprovalCallbackProcessor,
    // PDF Rendering queue processors
    PdfRenderProcessor,
    // Pastoral queue processors
    NotifyConcernProcessor,
    EscalationTimeoutProcessor,
    PrecomputeAgendaProcessor,
    OverdueActionsProcessor,
    SyncBehaviourSafeguardingProcessor,
    InterventionReviewReminderProcessor,
    CheckinAlertProcessor,
    WellbeingFlagExpiryProcessor,
    PastoralCronDispatchProcessor,
    // Monitoring processors
    CanaryProcessor,
    DlqMonitorProcessor,
    // Security queue processors
    KeyRotationProcessor,
    AnomalyScanProcessor,
    BreachDeadlineProcessor,
    // Regulatory queue processors
    RegulatoryDeadlineCheckProcessor,
    RegulatoryDesGenerateProcessor,
    RegulatoryPpodImportProcessor,
    RegulatoryPpodSyncProcessor,
    RegulatoryTuslaThresholdScanProcessor,
    // Homework queue processors
    HomeworkOverdueDetectionProcessor,
    HomeworkGenerateRecurringProcessor,
    HomeworkDigestProcessor,
    HomeworkCompletionReminderProcessor,
    // Early Warning queue processors
    ComputeDailyProcessor,
    ComputeStudentProcessor,
    WeeklyDigestProcessor,
    // Engagement queue processors
    CancelEventProcessor,
    ChaseOutstandingProcessor,
    EngagementAnnualRenewalProcessor,
    EngagementConferenceRemindersProcessor,
    EngagementDistributeFormsProcessor,
    ExpirePendingProcessor,
    GenerateEventInvoicesProcessor,
    GenerateTripPackProcessor,
    // Staff Wellbeing queue processors
    ModerationScanProcessor,
    SurveyOpenNotifyProcessor,
    SurveyClosingReminderProcessor,
    CleanupParticipationTokensProcessor,
    EapRefreshCheckProcessor,
    WorkloadMetricsProcessor,
  ],
})
export class WorkerModule implements BeforeApplicationShutdown, OnModuleDestroy {
  private readonly logger = new Logger(WorkerModule.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    const drainMs = this.configService.get<number>(
      'WORKER_SHUTDOWN_GRACE_MS',
      DEFAULT_WORKER_SHUTDOWN_GRACE_MS,
    );

    this.logger.warn(
      `Worker shutdown requested (${signal ?? 'unknown'}) — allowing ${drainMs}ms for BullMQ jobs to drain`,
    );

    await new Promise((resolve) => setTimeout(resolve, drainMs));
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
