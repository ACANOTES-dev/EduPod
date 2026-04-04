import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { S3Module } from '../s3/s3.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SequenceModule } from '../sequence/sequence.module';

import { BehaviourAmendmentsController } from './behaviour-amendments.controller';
import { BehaviourAmendmentsService } from './behaviour-amendments.service';
import { BehaviourAppealsController } from './behaviour-appeals.controller';
import { BehaviourAppealsService } from './behaviour-appeals.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourDocumentsController } from './behaviour-documents.controller';
import { BehaviourExclusionCasesService } from './behaviour-exclusion-cases.service';
import { BehaviourExclusionsController } from './behaviour-exclusions.controller';
import { BehaviourGuardianRestrictionsController } from './behaviour-guardian-restrictions.controller';
import { BehaviourGuardianRestrictionsService } from './behaviour-guardian-restrictions.service';
import { BehaviourInterventionsController } from './behaviour-interventions.controller';
import { BehaviourInterventionsService } from './behaviour-interventions.service';
import { BehaviourLegalHoldService } from './behaviour-legal-hold.service';
import { BehaviourSanctionsCrudService } from './behaviour-sanctions-crud.service';
import { BehaviourSanctionsLifecycleService } from './behaviour-sanctions-lifecycle.service';
import { BehaviourSanctionsMeetingsService } from './behaviour-sanctions-meetings.service';
import { BehaviourSanctionsController } from './behaviour-sanctions.controller';
import { BehaviourSanctionsService } from './behaviour-sanctions.service';

@Module({
  imports: [
    AuthModule,
    PdfRenderingModule,
    S3Module,
    SchedulesModule,
    SequenceModule,
    BehaviourCoreModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
    BullModule.registerQueue({ name: 'pdf-rendering' }),
  ],
  controllers: [
    BehaviourSanctionsController,
    BehaviourAppealsController,
    BehaviourExclusionsController,
    BehaviourAmendmentsController,
    BehaviourDocumentsController,
    BehaviourGuardianRestrictionsController,
    BehaviourInterventionsController,
  ],
  providers: [
    BehaviourSanctionsCrudService,
    BehaviourSanctionsLifecycleService,
    BehaviourSanctionsMeetingsService,
    BehaviourSanctionsService,
    BehaviourAppealsService,
    BehaviourExclusionCasesService,
    BehaviourAmendmentsService,
    BehaviourLegalHoldService,
    BehaviourDocumentService,
    BehaviourGuardianRestrictionsService,
    BehaviourInterventionsService,
  ],
  exports: [BehaviourLegalHoldService, BehaviourSanctionsService, BehaviourAppealsService],
})
export class BehaviourDisciplineModule {}
