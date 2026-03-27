import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
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
import { ParentContactService } from './services/parent-contact.service';
import { ParentPastoralService } from './services/parent-pastoral.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { SstAgendaGeneratorService } from './services/sst-agenda-generator.service';
import { SstMeetingService } from './services/sst-meeting.service';
import { SstService } from './services/sst.service';
import { StudentChronologyService } from './services/student-chronology.service';

@Module({
  imports: [
    AuthModule,
    CommunicationsModule,
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
    ParentContactService,
    ParentPastoralService,
    PastoralEventService,
    PastoralNotificationService,
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
    ParentContactService,
    PastoralEventService,
    PastoralNotificationService,
    SstService,
    StudentChronologyService,
  ],
})
export class PastoralModule {}
