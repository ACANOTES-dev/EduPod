import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { RbacModule } from '../rbac/rbac.module';
import { SearchModule } from '../search/search.module';
import { SequenceModule } from '../sequence/sequence.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AdmissionFormsController } from './admission-forms.controller';
import { AdmissionFormsService } from './admission-forms.service';
import { AdmissionsAutoPromotionService } from './admissions-auto-promotion.service';
import { AdmissionsCapacityService } from './admissions-capacity.service';
import { AdmissionsDashboardController } from './admissions-dashboard.controller';
import { AdmissionsDashboardService } from './admissions-dashboard.service';
import { AdmissionsFinanceBridgeService } from './admissions-finance-bridge.service';
import {
  AdmissionOverridesController,
  AdmissionsPaymentController,
} from './admissions-payment.controller';
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
    forwardRef(() => FinanceModule),
    TenantsModule,
    RbacModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    AdmissionFormsController,
    ApplicationsController,
    PublicAdmissionsController,
    ParentApplicationsController,
    AdmissionsPaymentController,
    AdmissionOverridesController,
    AdmissionsDashboardController,
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
    AdmissionsAutoPromotionService,
    AdmissionsDashboardService,
    FinanceFeesFacade,
    AdmissionsFinanceBridgeService,
  ],
  exports: [
    ApplicationsService,
    AdmissionsPaymentService,
    AdmissionsCapacityService,
    AdmissionsAutoPromotionService,
    ApplicationConversionService,
    ApplicationStateMachineService,
    AdmissionsFinanceBridgeService,
  ],
})
export class AdmissionsModule {}
