import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { SearchModule } from '../search/search.module';
import { SequenceModule } from '../sequence/sequence.module';
import { TenantsModule } from '../tenants/tenants.module';

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
import { FinanceFeesFacade } from './finance-fees.facade';
import { ParentApplicationsController } from './parent-applications.controller';
import { PublicAdmissionsController } from './public-admissions.controller';

@Module({
  imports: [
    SequenceModule,
    ApprovalsModule,
    SearchModule,
    ConfigurationModule,
    AcademicsModule,
    FinanceModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
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
    FinanceFeesFacade,
  ],
  exports: [
    ApplicationsService,
    AdmissionsPaymentService,
    AdmissionsCapacityService,
    ApplicationConversionService,
  ],
})
export class AdmissionsModule {}
