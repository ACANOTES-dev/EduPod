import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { S3Module } from '../s3/s3.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BehaviourAdminController } from './behaviour-admin.controller';
import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourAIService } from './behaviour-ai.service';
import { BehaviourAlertsController } from './behaviour-alerts.controller';
import { BehaviourAlertsService } from './behaviour-alerts.service';
import { BehaviourAmendmentsController } from './behaviour-amendments.controller';
import { BehaviourAmendmentsService } from './behaviour-amendments.service';
import { BehaviourAnalyticsController } from './behaviour-analytics.controller';
import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourAppealsController } from './behaviour-appeals.controller';
import { BehaviourAppealsService } from './behaviour-appeals.service';
import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';
import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourDocumentsController } from './behaviour-documents.controller';
import { BehaviourExclusionCasesService } from './behaviour-exclusion-cases.service';
import { BehaviourExclusionsController } from './behaviour-exclusions.controller';
import { BehaviourGuardianRestrictionsController } from './behaviour-guardian-restrictions.controller';
import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourLegalHoldService } from './behaviour-legal-hold.service';
import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourInterventionsController } from './behaviour-interventions.controller';
import { BehaviourInterventionsService } from './behaviour-interventions.service';
import { BehaviourParentController } from './behaviour-parent.controller';
import { BehaviourParentService } from './behaviour-parent.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourPulseService } from './behaviour-pulse.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourRecognitionController } from './behaviour-recognition.controller';
import { BehaviourRecognitionService } from './behaviour-recognition.service';
import { BehaviourSanctionsController } from './behaviour-sanctions.controller';
import { BehaviourSanctionsService } from './behaviour-sanctions.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStudentsController } from './behaviour-students.controller';
import { BehaviourStudentsService } from './behaviour-students.service';
import { BehaviourTasksController } from './behaviour-tasks.controller';
import { BehaviourTasksService } from './behaviour-tasks.service';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { PolicyEvaluationEngine } from './policy/policy-evaluation-engine';
import { PolicyReplayService } from './policy/policy-replay.service';
import { PolicyRulesService } from './policy/policy-rules.service';
import { SafeguardingAttachmentService } from './safeguarding-attachment.service';
import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';
import { SafeguardingController } from './safeguarding.controller';
import { SafeguardingService } from './safeguarding.service';

@Module({
  imports: [
    AuthModule,
    ApprovalsModule,
    TenantsModule,
    PdfRenderingModule,
    S3Module,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
  ],
  controllers: [
    BehaviourController,
    BehaviourStudentsController,
    BehaviourTasksController,
    BehaviourConfigController,
    BehaviourRecognitionController,
    BehaviourInterventionsController,
    BehaviourGuardianRestrictionsController,
    SafeguardingController,
    BehaviourSanctionsController,
    BehaviourAppealsController,
    BehaviourExclusionsController,
    BehaviourAmendmentsController,
    BehaviourAnalyticsController,
    BehaviourAlertsController,
    BehaviourDocumentsController,
    BehaviourParentController,
    BehaviourAdminController,
  ],
  providers: [
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourConfigService,
    BehaviourPointsService,
    BehaviourAwardService,
    BehaviourRecognitionService,
    BehaviourHouseService,
    BehaviourInterventionsService,
    BehaviourGuardianRestrictionsService,
    BehaviourService,
    BehaviourQuickLogService,
    BehaviourStudentsService,
    BehaviourTasksService,
    PolicyRulesService,
    PolicyEvaluationEngine,
    PolicyReplayService,
    SafeguardingService,
    SafeguardingAttachmentService,
    SafeguardingBreakGlassService,
    BehaviourSanctionsService,
    BehaviourAppealsService,
    BehaviourExclusionCasesService,
    BehaviourAmendmentsService,
    BehaviourPulseService,
    BehaviourAnalyticsService,
    BehaviourAlertsService,
    BehaviourAIService,
    BehaviourDocumentService,
    BehaviourDocumentTemplateService,
    BehaviourParentService,
    BehaviourLegalHoldService,
    BehaviourAdminService,
  ],
  exports: [
    BehaviourService,
    BehaviourConfigService,
    BehaviourStudentsService,
    BehaviourTasksService,
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourQuickLogService,
    BehaviourPointsService,
    BehaviourAwardService,
    BehaviourRecognitionService,
    BehaviourHouseService,
    BehaviourInterventionsService,
    BehaviourGuardianRestrictionsService,
    PolicyRulesService,
    PolicyEvaluationEngine,
    PolicyReplayService,
    SafeguardingService,
    SafeguardingAttachmentService,
    SafeguardingBreakGlassService,
    BehaviourSanctionsService,
    BehaviourAppealsService,
    BehaviourExclusionCasesService,
    BehaviourAmendmentsService,
    BehaviourPulseService,
    BehaviourAnalyticsService,
    BehaviourAlertsService,
    BehaviourAIService,
    BehaviourDocumentService,
    BehaviourDocumentTemplateService,
    BehaviourParentService,
    BehaviourLegalHoldService,
    BehaviourAdminService,
  ],
})
export class BehaviourModule {}
