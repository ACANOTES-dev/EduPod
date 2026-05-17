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

import { AlertAckTokenService } from './alert-ack-token.service';
import { AlertChannelsController } from './alert-channels.controller';
import { AlertChannelsService } from './alert-channels.service';
import { AlertDispatchService } from './alert-dispatch.service';
import { AlertEscalationCronService } from './alert-escalation-cron.service';
import { AlertEscalationPoliciesService } from './alert-escalation-policies.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import { AlertHistoryController } from './alert-history.controller';
import { AlertHistoryService } from './alert-history.service';
import { AlertMagicAckController } from './alert-magic-ack.controller';
import { AlertRouteDeadManCronService } from './alert-route-dead-man-cron.service';
import { AlertRoutesService } from './alert-routes.service';
import { AlertRoutingController } from './alert-routing.controller';
import { AlertRoutingService } from './alert-routing.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertSilenceService } from './alert-silence.service';
import { AlertSilencesController } from './alert-silences.controller';
import { AlertTestRateLimitService } from './alert-test-rate-limit.service';
import { ChannelDispatchService } from './channel-dispatch.service';
import { CopilotInjectionScanner } from './copilot-injection-scanner';
import { CopilotPromptBuilderService } from './copilot-prompt-builder.service';
import { CopilotResponsePostProcessor } from './copilot-response-post-processor';
import { CorrelationEventIngesterService } from './correlation-event-ingester.service';
import { EmailAlertDispatcher } from './dispatchers/email-alert.dispatcher';
import { PushAlertDispatcher } from './dispatchers/push-alert.dispatcher';
import { TelegramAlertDispatcher } from './dispatchers/telegram-alert.dispatcher';
import { WhatsAppAlertDispatcher } from './dispatchers/whatsapp-alert.dispatcher';
import { EmergencyContactController } from './emergency-contact.controller';
import { EmergencyContactService } from './emergency-contact.service';
import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';
import { IncidentDetectionService } from './incident-detection.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { MaintenanceWindowsController } from './maintenance-windows.controller';
import { OnboardingController } from './onboarding.controller';
import { OwnerActionConfirmationService } from './owner-action-confirmation.service';
import { OwnerActionConfirmationsController } from './owner-action-confirmations.controller';
import { PlatformAiActionProposalsController } from './platform-ai-action-proposals.controller';
import { PlatformAiActionProposalsService } from './platform-ai-action-proposals.service';
import { PlatformAiCopilotController } from './platform-ai-copilot.controller';
import { PlatformAiCopilotService } from './platform-ai-copilot.service';
import { PlatformAiCostGuardService } from './platform-ai-cost-guard.service';
import { PlatformAiRecommendationController } from './platform-ai-recommendation.controller';
import { PlatformAiRecommendationService } from './platform-ai-recommendation.service';
import { PlatformEvidenceService } from './platform-evidence.service';
import { PlatformIncidentService } from './platform-incident.service';
import { PlatformIncidentsController } from './platform-incidents.controller';
import { PlatformObservabilityController } from './platform-observability.controller';
import { PlatformObservabilityService } from './platform-observability.service';
import { PlatformOnboardingModule } from './platform-onboarding.module';
import { PlatformRealtimeModule } from './platform-realtime.module';
import { PlatformSearchController } from './platform-search.controller';
import { PlatformSearchService } from './platform-search.service';
import { PlatformGateway } from './platform.gateway';
import { PostmortemGeneratorService } from './postmortem-generator.service';
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
    AlertMagicAckController,
    AlertRoutingController,
    AlertRulesController,
    AlertHistoryController,
    AlertSilencesController,
    MaintenanceWindowsController,
    OwnerActionConfirmationsController,
    PlatformAiActionProposalsController,
    PlatformAiCopilotController,
    PlatformAiRecommendationController,
    PlatformIncidentsController,
    OnboardingController,
    PlatformObservabilityController,
    PlatformSearchController,
    TenantMetricsController,
    EmergencyContactController,
  ],
  providers: [
    PlatformGateway,
    HealthSnapshotService,
    AlertAckTokenService,
    AlertChannelsService,
    AlertEscalationCronService,
    AlertEscalationPoliciesService,
    AlertRulesService,
    AlertRouteDeadManCronService,
    AlertRoutesService,
    AlertRoutingService,
    AlertHistoryService,
    AlertSilenceService,
    AlertTestRateLimitService,
    MaintenanceWindowService,
    OwnerActionConfirmationService,
    PlatformAiActionProposalsService,
    PlatformAiCopilotService,
    PlatformAiRecommendationService,
    PlatformAiCostGuardService,
    PlatformIncidentService,
    IncidentDetectionService,
    PostmortemGeneratorService,
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
    EmergencyContactService,
    EmailAlertDispatcher,
    TelegramAlertDispatcher,
    WhatsAppAlertDispatcher,
    PushAlertDispatcher,
  ],
  exports: [PlatformOnboardingModule, PlatformRealtimeModule, AlertRoutingService],
})
export class PlatformModule {}
