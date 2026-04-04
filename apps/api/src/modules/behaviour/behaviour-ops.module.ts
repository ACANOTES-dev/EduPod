import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';

import { BehaviourAdminController } from './behaviour-admin.controller';
import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDisciplineModule } from './behaviour-discipline.module';
import { BehaviourExportService } from './behaviour-export.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    PdfRenderingModule,
    BehaviourCoreModule,
    BehaviourDisciplineModule,
    PolicyEngineModule,
    BullModule.registerQueue({ name: 'behaviour' }),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'search-sync' }),
  ],
  controllers: [BehaviourAdminController],
  providers: [BehaviourAdminService, BehaviourExportService],
  exports: [BehaviourExportService],
})
export class BehaviourOpsModule {}
