import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StudentsModule } from '../students/students.module';

import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDisciplineModule } from './behaviour-discipline.module';
import { BehaviourOpsModule } from './behaviour-ops.module';
import { BehaviourParentController } from './behaviour-parent.controller';
import { BehaviourParentService } from './behaviour-parent.service';
import { BehaviourStudentsController } from './behaviour-students.controller';
import { BehaviourStudentsService } from './behaviour-students.service';

@Module({
  imports: [
    AuthModule,
    BehaviourCoreModule,
    BehaviourDisciplineModule,
    BehaviourOpsModule,
    StudentsModule,
  ],
  controllers: [BehaviourStudentsController, BehaviourParentController],
  providers: [BehaviourStudentsService, BehaviourParentService],
  exports: [BehaviourStudentsService, BehaviourParentService],
})
export class BehaviourPortalModule {}
