import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SearchModule } from '../search/search.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AdmissionFormsController } from './admission-forms.controller';
import { AdmissionFormsService } from './admission-forms.service';
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
  imports: [TenantsModule, ApprovalsModule, SearchModule, ConfigurationModule],
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
  ],
  exports: [ApplicationsService, AdmissionsPaymentService],
})
export class AdmissionsModule {}
