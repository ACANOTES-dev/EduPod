import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { TenantsModule } from '../tenants/tenants.module';

import { SenGoalController } from './sen-goal.controller';
import { SenGoalService } from './sen-goal.service';
import { SenProfileController } from './sen-profile.controller';
import { SenProfileService } from './sen-profile.service';
import { SenResourceController } from './sen-resource.controller';
import { SenResourceService } from './sen-resource.service';
import { SenScopeService } from './sen-scope.service';
import { SenSnaController } from './sen-sna.controller';
import { SenSnaService } from './sen-sna.service';
import { SenSupportPlanController } from './sen-support-plan.controller';
import { SenSupportPlanService } from './sen-support-plan.service';

@Module({
  imports: [AuthModule, ConfigurationModule, TenantsModule],
  controllers: [
    SenProfileController,
    SenSupportPlanController,
    SenGoalController,
    SenResourceController,
    SenSnaController,
  ],
  providers: [
    SenProfileService,
    SenScopeService,
    SenSupportPlanService,
    SenGoalService,
    SenResourceService,
    SenSnaService,
  ],
  exports: [
    SenProfileService,
    SenScopeService,
    SenSupportPlanService,
    SenGoalService,
    SenResourceService,
    SenSnaService,
  ],
})
export class SenModule {}
