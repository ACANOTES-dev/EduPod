import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ConferencesController } from './conferences.controller';
import { ConferencesService } from './conferences.service';
import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';
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
    PdfRenderingModule,
    PrismaModule,
    BullModule.registerQueue({ name: 'engagement' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    ConferencesController,
    ConsentRecordsController,
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
    EventParticipantsService,
    EventsService,
    FormSubmissionsService,
    FormTemplatesService,
    TripPackService,
  ],
  exports: [
    ConferencesService,
    ConsentRecordsService,
    EventParticipantsService,
    EventsService,
    FormSubmissionsService,
    FormTemplatesService,
    TripPackService,
  ],
})
export class EngagementModule {}
