import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

import { BehaviourAdminController } from './behaviour-admin.controller';
import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDisciplineModule } from './behaviour-discipline.module';
import { BehaviourExportService } from './behaviour-export.service';
import { BehaviourParentController } from './behaviour-parent.controller';
import { BehaviourParentService } from './behaviour-parent.service';
import { BehaviourStudentsController } from './behaviour-students.controller';
import { BehaviourStudentsService } from './behaviour-students.service';

@Module({
  imports: [
    AuthModule,
    PdfRenderingModule,
    BehaviourCoreModule,
    BehaviourDisciplineModule,
    BullModule.registerQueue({ name: 'behaviour' }),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'search-sync' }),
  ],
  controllers: [BehaviourAdminController, BehaviourStudentsController, BehaviourParentController],
  providers: [
    BehaviourAdminService,
    BehaviourExportService,
    BehaviourParentService,
    BehaviourStudentsService,
  ],
  exports: [BehaviourStudentsService, BehaviourParentService],
})
export class BehaviourAdminModule {}
