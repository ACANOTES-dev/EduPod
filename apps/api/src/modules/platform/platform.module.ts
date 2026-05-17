import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';
import { ParentsModule } from '../parents/parents.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformErrorLogModule } from '../platform-error-log/platform-error-log.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { QueueAdminModule } from '../queue-admin/queue-admin.module';
import { RbacModule } from '../rbac/rbac.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AlertChannelsController } from './alert-channels.controller';
import { AlertChannelsService } from './alert-channels.service';
import { AlertDispatchService } from './alert-dispatch.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import { AlertHistoryController } from './alert-history.controller';
import { AlertHistoryService } from './alert-history.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertSilenceService } from './alert-silence.service';
import { AlertSilencesController } from './alert-silences.controller';
import { ChannelDispatchService } from './channel-dispatch.service';
import { CopilotInjectionScanner } from './copilot-injection-scanner';
import { CopilotPromptBuilderService } from './copilot-prompt-builder.service';
import { CopilotResponsePostProcessor } from './copilot-response-post-processor';
import { CorrelationEventIngesterService } from './correlation-event-ingester.service';
import { EmailAlertDispatcher } from './dispatchers/email-alert.dispatcher';
import { PushAlertDispatcher } from './dispatchers/push-alert.dispatcher';
import { TelegramAlertDispatcher } from './dispatchers/telegram-alert.dispatcher';
import { WhatsAppAlertDispatcher } from './dispatchers/whatsapp-alert.dispatcher';
import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { MaintenanceWindowsController } from './maintenance-windows.controller';
import { OnboardingController } from './onboarding.controller';
import { OwnerActionConfirmationService } from './owner-action-confirmation.service';
import { OwnerActionConfirmationsController } from './owner-action-confirmations.controller';
import { PlatformAiCopilotController } from './platform-ai-copilot.controller';
import { PlatformAiCopilotService } from './platform-ai-copilot.service';
import { PlatformAiCostGuardService } from './platform-ai-cost-guard.service';
import { PlatformAiRecommendationController } from './platform-ai-recommendation.controller';
import { PlatformAiRecommendationService } from './platform-ai-recommendation.service';
import { PlatformEvidenceService } from './platform-evidence.service';
import { PlatformObservabilityController } from './platform-observability.controller';
import { PlatformObservabilityService } from './platform-observability.service';
import { PlatformOnboardingModule } from './platform-onboarding.module';
import { PlatformRealtimeModule } from './platform-realtime.module';
import { PlatformSearchController } from './platform-search.controller';
import { PlatformSearchService } from './platform-search.service';
import { PlatformGateway } from './platform.gateway';
import { TenantMetricsController } from './tenant-metrics.controller';
import { TenantMetricsService } from './tenant-metrics.service';

@Module({
  imports: [
    AiModule,
    AttendanceModule,
    AuthModule,
    CommunicationsModule,
    ConfigurationModule,
    FinanceModule,
    HealthModule,
    ParentsModule,
    PlatformAuditModule,
    PlatformErrorLogModule,
    PlatformOnboardingModule,
    PlatformRealtimeModule,
    PlatformUsersModule,
    QueueAdminModule,
    RbacModule,
    StaffProfilesModule,
    StudentsModule,
    TenantsModule,
  ],
  controllers: [
    HealthHistoryController,
    AlertChannelsController,
    AlertRulesController,
    AlertHistoryController,
    AlertSilencesController,
    MaintenanceWindowsController,
    OwnerActionConfirmationsController,
    PlatformAiCopilotController,
    PlatformAiRecommendationController,
    OnboardingController,
    PlatformObservabilityController,
    PlatformSearchController,
    TenantMetricsController,
  ],
  providers: [
    PlatformGateway,
    HealthSnapshotService,
    AlertChannelsService,
    AlertRulesService,
    AlertHistoryService,
    AlertSilenceService,
    MaintenanceWindowService,
    OwnerActionConfirmationService,
    PlatformAiCopilotService,
    PlatformAiRecommendationService,
    PlatformAiCostGuardService,
    CopilotPromptBuilderService,
    CopilotResponsePostProcessor,
    CopilotInjectionScanner,
    CorrelationEventIngesterService,
    PlatformEvidenceService,
    PlatformObservabilityService,
    AlertEvaluationService,
    AlertDispatchService,
    ChannelDispatchService,
    TenantMetricsService,
    PlatformSearchService,
    EmailAlertDispatcher,
    TelegramAlertDispatcher,
    WhatsAppAlertDispatcher,
    PushAlertDispatcher,
  ],
  exports: [PlatformOnboardingModule, PlatformRealtimeModule],
})
export class PlatformModule {}
