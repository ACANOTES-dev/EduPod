import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourGuardianRestrictionsController } from './behaviour-guardian-restrictions.controller';
import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourInterventionsController } from './behaviour-interventions.controller';
import { BehaviourInterventionsService } from './behaviour-interventions.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourRecognitionController } from './behaviour-recognition.controller';
import { BehaviourRecognitionService } from './behaviour-recognition.service';
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
  ],
})
export class BehaviourModule {}
