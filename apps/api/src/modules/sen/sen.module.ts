import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { TenantsModule } from '../tenants/tenants.module';

import { SenAccommodationController } from './sen-accommodation.controller';
import { SenAccommodationService } from './sen-accommodation.service';
import { SenGoalController } from './sen-goal.controller';
import { SenGoalService } from './sen-goal.service';
import { SenProfessionalController } from './sen-professional.controller';
import { SenProfessionalService } from './sen-professional.service';
import { SenProfileController } from './sen-profile.controller';
import { SenProfileService } from './sen-profile.service';
import { SenReportsController } from './sen-reports.controller';
import { SenReportsService } from './sen-reports.service';
import { SenResourceController } from './sen-resource.controller';
import { SenResourceService } from './sen-resource.service';
import { SenScopeService } from './sen-scope.service';
import { SenSnaController } from './sen-sna.controller';
import { SenSnaService } from './sen-sna.service';
import { SenSupportPlanController } from './sen-support-plan.controller';
import { SenSupportPlanService } from './sen-support-plan.service';
import { SenTransitionController } from './sen-transition.controller';
import { SenTransitionService } from './sen-transition.service';

@Module({
  imports: [AuthModule, ConfigurationModule, TenantsModule],
  controllers: [
    SenProfileController,
    SenSupportPlanController,
    SenGoalController,
    SenResourceController,
    SenSnaController,
    SenProfessionalController,
    SenAccommodationController,
    SenReportsController,
    SenTransitionController,
  ],
  providers: [
    SenProfileService,
    SenScopeService,
    SenSupportPlanService,
    SenGoalService,
    SenResourceService,
    SenSnaService,
    SenProfessionalService,
    SenAccommodationService,
    SenReportsService,
    SenTransitionService,
  ],
  exports: [],
})
export class SenModule {}
