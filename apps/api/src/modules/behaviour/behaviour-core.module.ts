import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourTasksController } from './behaviour-tasks.controller';
import { BehaviourTasksService } from './behaviour-tasks.service';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { PolicyEvaluationEngine } from './policy/policy-evaluation-engine';
import { PolicyReplayService } from './policy/policy-replay.service';
import { PolicyRulesService } from './policy/policy-rules.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
  ],
  controllers: [BehaviourController, BehaviourConfigController, BehaviourTasksController],
  providers: [
    BehaviourService,
    BehaviourQuickLogService,
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourConfigService,
    BehaviourTasksService,
    BehaviourAttachmentService,
    BehaviourPointsService,
    PolicyRulesService,
    PolicyEvaluationEngine,
    PolicyReplayService,
    BehaviourDocumentTemplateService,
  ],
  exports: [
    BehaviourService,
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourConfigService,
    BehaviourPointsService,
    PolicyEvaluationEngine,
    PolicyReplayService,
  ],
})
export class BehaviourCoreModule {}
