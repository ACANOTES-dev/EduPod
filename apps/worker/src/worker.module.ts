import { BullModule } from '@nestjs/bullmq';
import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { QUEUE_NAMES } from './base/queue.constants';
import { CronSchedulerService } from './cron/cron-scheduler.service';
import { WorkerHealthController } from './health/worker-health.controller';
import { AdmissionsAutoExpiryProcessor } from './processors/admissions-auto-expiry.processor';
import { AttendanceAutoLockProcessor } from './processors/attendance-auto-lock.processor';
import { AttendancePatternDetectionProcessor } from './processors/attendance-pattern-detection.processor';
import { AttendancePendingDetectionProcessor } from './processors/attendance-pending-detection.processor';
import { AttendanceSessionGenerationProcessor } from './processors/attendance-session-generation.processor';
import { AttachmentScanProcessor } from './processors/behaviour/attachment-scan.processor';
import { BreakGlassExpiryProcessor } from './processors/behaviour/break-glass-expiry.processor';
import { BehaviourCheckAwardsProcessor } from './processors/behaviour/check-awards.processor';
import { CriticalEscalationProcessor } from './processors/behaviour/critical-escalation.processor';
import { DetectPatternsProcessor } from './processors/behaviour/detect-patterns.processor';
import { EvaluatePolicyProcessor } from './processors/behaviour/evaluate-policy.processor';
import { BehaviourGuardianRestrictionCheckProcessor } from './processors/behaviour/guardian-restriction-check.processor';
import { DigestNotificationsProcessor } from './processors/behaviour/digest-notifications.processor';
import { BehaviourParentNotificationProcessor } from './processors/behaviour/parent-notification.processor';
import { RefreshMVProcessor } from './processors/behaviour/refresh-mv.processor';
import { SlaCheckProcessor } from './processors/behaviour/sla-check.processor';
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
import { InvoiceApprovalCallbackProcessor } from './processors/finance/invoice-approval-callback.processor';
import { OverdueDetectionProcessor } from './processors/finance/overdue-detection.processor';
import { BulkImportProcessor } from './processors/gradebook/bulk-import.processor';
import { GradebookRiskDetectionProcessor } from './processors/gradebook/gradebook-risk-detection.processor';
import { MassReportCardPdfProcessor } from './processors/gradebook/mass-report-card-pdf.processor';
import { ReportCardAutoGenerateProcessor } from './processors/gradebook/report-card-auto-generate.processor';
import { ImportFileCleanupProcessor } from './processors/imports/import-file-cleanup.processor';
import { ImportProcessingProcessor } from './processors/imports/import-processing.processor';
import { ImportValidationProcessor } from './processors/imports/import-validation.processor';
import { PayrollApprovalCallbackProcessor } from './processors/payroll/approval-callback.processor';
import { PayrollMassExportProcessor } from './processors/payroll/mass-export.processor';
import { PayrollSessionGenerationProcessor } from './processors/payroll/session-generation.processor';
import { SchedulingSolverV2Processor } from './processors/scheduling/solver-v2.processor';
import { SchedulingSolverProcessor } from './processors/scheduling-solver.processor';
import { SchedulingStaleReaperProcessor } from './processors/scheduling-stale-reaper.processor';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { SearchReindexProcessor } from './processors/search-reindex.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
        name: QUEUE_NAMES.PAYROLL,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.NOTIFICATIONS,
        defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 1000 },
      },
      {
        name: QUEUE_NAMES.SEARCH_SYNC,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.REPORTS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.ATTENDANCE,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.SCHEDULING,
        defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.GRADEBOOK,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.FINANCE,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.IMPORTS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.ADMISSIONS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.BEHAVIOUR,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
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
    // Admissions queue processors
    AdmissionsAutoExpiryProcessor,
    // Behaviour queue processors
    BehaviourParentNotificationProcessor,
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
    // Search queue processors
    SearchIndexProcessor,
    SearchReindexProcessor,
    // Attendance queue processors
    AttendanceSessionGenerationProcessor,
    AttendancePendingDetectionProcessor,
    AttendanceAutoLockProcessor,
    AttendancePatternDetectionProcessor,
    // Scheduling queue processors
    SchedulingSolverProcessor,
    SchedulingSolverV2Processor,
    SchedulingStaleReaperProcessor,
    // Gradebook queue processors
    MassReportCardPdfProcessor,
    BulkImportProcessor,
    GradebookRiskDetectionProcessor,
    ReportCardAutoGenerateProcessor,
    // Cron scheduler — registers repeatable BullMQ jobs on startup
    CronSchedulerService,
    // Finance queue processors
    OverdueDetectionProcessor,
    InvoiceApprovalCallbackProcessor,
    // Imports queue processors
    ImportValidationProcessor,
    ImportProcessingProcessor,
    ImportFileCleanupProcessor,
    // Compliance (on imports queue — low volume)
    ComplianceExecutionProcessor,
    // Payroll queue processors
    PayrollSessionGenerationProcessor,
    PayrollMassExportProcessor,
    PayrollApprovalCallbackProcessor,
    // Communications / Notifications queue processors
    PublishAnnouncementProcessor,
    DispatchNotificationsProcessor,
    RetryFailedNotificationsProcessor,
    InquiryNotificationProcessor,
    StaleInquiryDetectionProcessor,
    IpCleanupProcessor,
    AnnouncementApprovalCallbackProcessor,
  ],
})
export class WorkerModule implements OnModuleDestroy {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
