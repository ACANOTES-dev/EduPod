import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { S3Module } from '../s3/s3.module';
import { TenantsModule } from '../tenants/tenants.module';

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
import { BehaviourSanctionsController } from './behaviour-sanctions.controller';
import { BehaviourSanctionsService } from './behaviour-sanctions.service';

@Module({
  imports: [
    AuthModule,
    PdfRenderingModule,
    S3Module,
    TenantsModule,
    BehaviourCoreModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
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
    BehaviourSanctionsService,
    BehaviourAppealsService,
    BehaviourExclusionCasesService,
    BehaviourAmendmentsService,
    BehaviourLegalHoldService,
    BehaviourDocumentService,
    BehaviourGuardianRestrictionsService,
    BehaviourInterventionsService,
  ],
  exports: [BehaviourSanctionsService, BehaviourAppealsService],
})
export class BehaviourDisciplineModule {}
