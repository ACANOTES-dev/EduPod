import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStudentsController } from './behaviour-students.controller';
import { BehaviourStudentsService } from './behaviour-students.service';
import { BehaviourTasksController } from './behaviour-tasks.controller';
import { BehaviourTasksService } from './behaviour-tasks.service';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    BehaviourController,
    BehaviourStudentsController,
    BehaviourTasksController,
    BehaviourConfigController,
  ],
  providers: [
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourConfigService,
    BehaviourService,
    BehaviourQuickLogService,
    BehaviourStudentsService,
    BehaviourTasksService,
  ],
  exports: [
    BehaviourService,
    BehaviourConfigService,
    BehaviourStudentsService,
    BehaviourTasksService,
    BehaviourHistoryService,
    BehaviourScopeService,
    BehaviourQuickLogService,
  ],
})
export class BehaviourModule {}
