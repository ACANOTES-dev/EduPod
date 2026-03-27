import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { CommunicationsModule } from '../communications/communications.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CasesController } from './controllers/cases.controller';
import { CheckinAdminController } from './controllers/checkin-admin.controller';
import { CheckinConfigController } from './controllers/checkin-config.controller';
import { CheckinsController } from './controllers/checkins.controller';
import { ConcernsController } from './controllers/concerns.controller';
import { CriticalIncidentsController } from './controllers/critical-incidents.controller';
import { InterventionsController } from './controllers/interventions.controller';
import { ParentContactsController } from './controllers/parent-contacts.controller';
import { ParentPastoralController } from './controllers/parent-pastoral.controller';
import { PastoralAdminController } from './controllers/pastoral-admin.controller';
import { PastoralReportsController } from './controllers/pastoral-reports.controller';
import { ReferralsController } from './controllers/referrals.controller';
import { SstController } from './controllers/sst.controller';
import { AuthorMaskingInterceptor } from './interceptors/author-masking.interceptor';
import { AffectedTrackingService } from './services/affected-tracking.service';
import { CaseService } from './services/case.service';
import { CheckinAlertService } from './services/checkin-alert.service';
import { CheckinAnalyticsService } from './services/checkin-analytics.service';
import { CheckinPrerequisiteService } from './services/checkin-prerequisite.service';
import { CheckinService } from './services/checkin.service';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { CriticalIncidentService } from './services/critical-incident.service';
import { InterventionActionService } from './services/intervention-action.service';
import { InterventionService } from './services/intervention.service';
import { NepsVisitService } from './services/neps-visit.service';
import { ParentContactService } from './services/parent-contact.service';
import { ParentPastoralService } from './services/parent-pastoral.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralExportService } from './services/pastoral-export.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { PastoralReportService } from './services/pastoral-report.service';
import { ReferralPrepopulateService } from './services/referral-prepopulate.service';
import { ReferralRecommendationService } from './services/referral-recommendation.service';
import { ReferralService } from './services/referral.service';
import { SstAgendaGeneratorService } from './services/sst-agenda-generator.service';
import { SstMeetingService } from './services/sst-meeting.service';
import { SstService } from './services/sst.service';
import { StudentChronologyService } from './services/student-chronology.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => ChildProtectionModule),
    CommunicationsModule,
    PdfRenderingModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    CasesController,
    CheckinAdminController,
    CheckinConfigController,
    CheckinsController,
    ConcernsController,
    CriticalIncidentsController,
    InterventionsController,
    ParentContactsController,
    ParentPastoralController,
    PastoralAdminController,
    PastoralReportsController,
    ReferralsController,
    SstController,
  ],
  providers: [
    AffectedTrackingService,
    AuthorMaskingInterceptor,
    CaseService,
    CheckinAlertService,
    CheckinAnalyticsService,
    CheckinPrerequisiteService,
    CheckinService,
    ConcernService,
    ConcernVersionService,
    CriticalIncidentService,
    InterventionActionService,
    InterventionService,
    NepsVisitService,
    ParentContactService,
    ParentPastoralService,
    PastoralEventService,
    PastoralExportService,
    PastoralNotificationService,
    PastoralReportService,
    ReferralPrepopulateService,
    ReferralRecommendationService,
    ReferralService,
    SstAgendaGeneratorService,
    SstMeetingService,
    SstService,
    StudentChronologyService,
  ],
  exports: [
    AffectedTrackingService,
    CaseService,
    CheckinService,
    ConcernService,
    ConcernVersionService,
    CriticalIncidentService,
    InterventionService,
    NepsVisitService,
    ParentContactService,
    PastoralEventService,
    PastoralNotificationService,
    PastoralReportService,
    ReferralService,
    SstService,
    StudentChronologyService,
  ],
})
export class PastoralModule {}
