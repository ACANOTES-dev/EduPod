import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { SearchModule } from '../search/search.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AdmissionFormsController } from './admission-forms.controller';
import { AdmissionFormsService } from './admission-forms.service';
import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ParentApplicationsController } from './parent-applications.controller';
import { PublicAdmissionsController } from './public-admissions.controller';

@Module({
  imports: [TenantsModule, ApprovalsModule, SearchModule],
  controllers: [
    AdmissionFormsController,
    ApplicationsController,
    PublicAdmissionsController,
    ParentApplicationsController,
  ],
  providers: [
    AdmissionFormsService,
    ApplicationsService,
    ApplicationNotesService,
    AdmissionsRateLimitService,
  ],
  exports: [ApplicationsService],
})
export class AdmissionsModule {}
