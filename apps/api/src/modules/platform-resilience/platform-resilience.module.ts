import { Module } from '@nestjs/common';

import { PlatformRealtimeModule } from '../platform/platform-realtime.module';
import { PlatformModule } from '../platform/platform.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformErrorLogModule } from '../platform-error-log/platform-error-log.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { QueueAdminModule } from '../queue-admin/queue-admin.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BackupReadinessScheduledTask } from './backup-readiness-scheduled.task';
import { BackupCaptureController, BackupReadinessController } from './backup-readiness.controller';
import { BackupReadinessService } from './backup-readiness.service';
import { EvidenceCompletenessController } from './evidence-completeness.controller';
import { EvidenceFreshnessScheduledTask } from './evidence-freshness-scheduled.task';
import { EvidenceFreshnessService } from './evidence-freshness.service';
import { EvidenceQueryHandlersService } from './evidence-query-handlers.service';
import { OffsiteReplicationPollerService } from './offsite-replication-poller.service';
import { QueueSnapshotHeartbeatTask } from './queue-snapshot-heartbeat.task';
import { RedisPubSubHeartbeatService } from './redis-pubsub-heartbeat.service';
import { SentryAlertEmitterService } from './sentry/sentry-alert-emitter.service';
import { SentryCorrelationService } from './sentry/sentry-correlation.service';
import { SentryIngestionService } from './sentry/sentry-ingestion.service';
import { SentryIssuesController } from './sentry/sentry-issues.controller';
import { SentryIssuesService } from './sentry/sentry-issues.service';
import { SentryPayloadNormalizerService } from './sentry/sentry-payload-normalizer.service';
import { SentryRetentionService } from './sentry/sentry-retention.service';
import { SentrySignatureService } from './sentry/sentry-signature.service';
import { SentryWebhookController } from './sentry/sentry-webhook.controller';
import { SyntheticAlertEmitterService } from './synthetic-alert-emitter.service';
import { SyntheticCheckHandlersService } from './synthetic-check-handlers.service';
import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';
import { SyntheticCheckSchedulerService } from './synthetic-check-scheduler.service';
import { SyntheticChecksController } from './synthetic-checks.controller';
import { SyntheticChecksService } from './synthetic-checks.service';
import { SyntheticCredentialResolverService } from './synthetic-credential-resolver.service';
import { UptimeReconciliationService } from './uptime-reconciliation.service';

@Module({
  imports: [
    PlatformAuditModule,
    PlatformErrorLogModule,
    PlatformModule,
    PlatformRealtimeModule,
    PlatformUsersModule,
    QueueAdminModule,
    TenantsModule,
  ],
  controllers: [
    BackupCaptureController,
    BackupReadinessController,
    EvidenceCompletenessController,
    SentryIssuesController,
    SentryWebhookController,
    SyntheticChecksController,
  ],
  providers: [
    BackupReadinessScheduledTask,
    BackupReadinessService,
    EvidenceFreshnessScheduledTask,
    EvidenceFreshnessService,
    EvidenceQueryHandlersService,
    OffsiteReplicationPollerService,
    QueueSnapshotHeartbeatTask,
    RedisPubSubHeartbeatService,
    SentryAlertEmitterService,
    SentryCorrelationService,
    SentryIngestionService,
    SentryIssuesService,
    SentryPayloadNormalizerService,
    SentryRetentionService,
    SentrySignatureService,
    SyntheticAlertEmitterService,
    SyntheticCheckHandlersService,
    SyntheticCheckRunnerService,
    SyntheticCheckSchedulerService,
    SyntheticChecksService,
    SyntheticCredentialResolverService,
    UptimeReconciliationService,
  ],
})
export class PlatformResilienceModule {}
