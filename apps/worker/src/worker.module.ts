import { BullModule } from '@nestjs/bullmq';
import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { QUEUE_NAMES } from './base/queue.constants';
import { WorkerHealthController } from './health/worker-health.controller';
import { AttendanceAutoLockProcessor } from './processors/attendance-auto-lock.processor';
import { AttendancePendingDetectionProcessor } from './processors/attendance-pending-detection.processor';
import { AttendanceSessionGenerationProcessor } from './processors/attendance-session-generation.processor';
import { PublishAnnouncementProcessor } from './processors/communications/publish-announcement.processor';
import { DispatchNotificationsProcessor } from './processors/communications/dispatch-notifications.processor';
import { RetryFailedNotificationsProcessor } from './processors/communications/retry-failed.processor';
import { InquiryNotificationProcessor } from './processors/communications/inquiry-notification.processor';
import { StaleInquiryDetectionProcessor } from './processors/communications/stale-inquiry-detection.processor';
import { IpCleanupProcessor } from './processors/communications/ip-cleanup.processor';
import { AnnouncementApprovalCallbackProcessor } from './processors/communications/announcement-approval-callback.processor';
import { ComplianceExecutionProcessor } from './processors/compliance/compliance-execution.processor';
import { OverdueDetectionProcessor } from './processors/finance/overdue-detection.processor';
import { InvoiceApprovalCallbackProcessor } from './processors/finance/invoice-approval-callback.processor';
import { MassReportCardPdfProcessor } from './processors/gradebook/mass-report-card-pdf.processor';
import { BulkImportProcessor } from './processors/gradebook/bulk-import.processor';
import { ImportValidationProcessor } from './processors/imports/import-validation.processor';
import { ImportProcessingProcessor } from './processors/imports/import-processing.processor';
import { ImportFileCleanupProcessor } from './processors/imports/import-file-cleanup.processor';
import { PayrollSessionGenerationProcessor } from './processors/payroll/session-generation.processor';
import { PayrollMassExportProcessor } from './processors/payroll/mass-export.processor';
import { PayrollApprovalCallbackProcessor } from './processors/payroll/approval-callback.processor';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { SearchReindexProcessor } from './processors/search-reindex.processor';
import { SchedulingSolverProcessor } from './processors/scheduling-solver.processor';
import { SchedulingStaleReaperProcessor } from './processors/scheduling-stale-reaper.processor';

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
    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.PAYROLL },
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.SEARCH_SYNC },
      { name: QUEUE_NAMES.REPORTS },
      { name: QUEUE_NAMES.ATTENDANCE },
      { name: QUEUE_NAMES.SCHEDULING },
      { name: QUEUE_NAMES.GRADEBOOK },
      { name: QUEUE_NAMES.FINANCE },
      { name: QUEUE_NAMES.IMPORTS },
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
    // Search queue processors
    SearchIndexProcessor,
    SearchReindexProcessor,
    // Attendance queue processors
    AttendanceSessionGenerationProcessor,
    AttendancePendingDetectionProcessor,
    AttendanceAutoLockProcessor,
    // Scheduling queue processors
    SchedulingSolverProcessor,
    SchedulingStaleReaperProcessor,
    // Gradebook queue processors
    MassReportCardPdfProcessor,
    BulkImportProcessor,
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
