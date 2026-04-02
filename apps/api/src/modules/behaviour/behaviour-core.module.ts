import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { SequenceModule } from '../sequence/sequence.module';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';
import { BehaviourTasksController } from './behaviour-tasks.controller';
import { BehaviourTasksService } from './behaviour-tasks.service';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';

@Module({
  imports: [
    AuthModule,
    SequenceModule,
    forwardRef(() => PolicyEngineModule),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
    BullModule.registerQueue({ name: 'search-sync' }),
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
    BehaviourDocumentTemplateService,
    BehaviourSideEffectsService,
  ],
  exports: [
    BehaviourDocumentTemplateService,
    BehaviourService,
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourConfigService,
    BehaviourPointsService,
    BehaviourSideEffectsService,
  ],
})
export class BehaviourCoreModule {}
