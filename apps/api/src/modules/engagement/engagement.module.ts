import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClassesModule } from '../classes/classes.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ParentsModule } from '../parents/parents.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { ConferencesController } from './conferences.controller';
import { ConferencesService } from './conferences.service';
import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';
import { EngagementAnalyticsController } from './engagement-analytics.controller';
import { EngagementAnalyticsService } from './engagement-analytics.service';
import { EventParticipantsService } from './event-participants.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormSubmissionsService } from './form-submissions.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';
import { ParentConferencesController } from './parent-conferences.controller';
import { ParentEventsController } from './parent-events.controller';
import { ParentFormsController } from './parent-forms.controller';
import { TripPackService } from './trip-pack.service';

@Module({
  imports: [
    ClassesModule,
    ConfigurationModule,
    ParentsModule,
    PdfRenderingModule,
    PrismaModule,
    StaffProfilesModule,
    StudentsModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'engagement' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    ConferencesController,
    ConsentRecordsController,
    EngagementAnalyticsController,
    EventsController,
    FormTemplatesController,
    FormSubmissionsController,
    ParentConferencesController,
    ParentEventsController,
    ParentFormsController,
  ],
  providers: [
    ConferencesService,
    ConsentRecordsService,
    EngagementAnalyticsService,
    EventParticipantsService,
    EventsService,
    FormSubmissionsService,
    FormTemplatesService,
    TripPackService,
  ],
  exports: [ConferencesService, ConsentRecordsService, EventsService],
})
export class EngagementModule {}
