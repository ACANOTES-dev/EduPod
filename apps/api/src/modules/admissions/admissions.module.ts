import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SearchModule } from '../search/search.module';
import { SequenceModule } from '../sequence/sequence.module';

import { AdmissionFormsController } from './admission-forms.controller';
import { AdmissionFormsService } from './admission-forms.service';
import { AdmissionsCapacityService } from './admissions-capacity.service';
import { AdmissionsPaymentService } from './admissions-payment.service';
import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationConversionService } from './application-conversion.service';
import { ApplicationNotesService } from './application-notes.service';
import { ApplicationStateMachineService } from './application-state-machine.service';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ParentApplicationsController } from './parent-applications.controller';
import { PublicAdmissionsController } from './public-admissions.controller';

@Module({
  imports: [SequenceModule, ApprovalsModule, SearchModule, ConfigurationModule, AcademicsModule],
  controllers: [
    AdmissionFormsController,
    ApplicationsController,
    PublicAdmissionsController,
    ParentApplicationsController,
  ],
  providers: [
    AdmissionFormsService,
    ApplicationsService,
    ApplicationStateMachineService,
    ApplicationConversionService,
    ApplicationNotesService,
    AdmissionsRateLimitService,
    AdmissionsPaymentService,
    AdmissionsCapacityService,
  ],
  exports: [
    ApplicationsService,
    AdmissionsPaymentService,
    AdmissionsCapacityService,
    ApplicationConversionService,
  ],
})
export class AdmissionsModule {}
