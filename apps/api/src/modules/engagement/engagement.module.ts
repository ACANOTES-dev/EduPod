import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';
import { EventParticipantsService } from './event-participants.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormSubmissionsService } from './form-submissions.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';
import { ParentEventsController } from './parent-events.controller';
import { ParentFormsController } from './parent-forms.controller';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'engagement' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    ConsentRecordsController,
    EventsController,
    FormTemplatesController,
    FormSubmissionsController,
    ParentEventsController,
    ParentFormsController,
  ],
  providers: [
    ConsentRecordsService,
    EventParticipantsService,
    EventsService,
    FormSubmissionsService,
    FormTemplatesService,
  ],
  exports: [
    ConsentRecordsService,
    EventParticipantsService,
    EventsService,
    FormSubmissionsService,
    FormTemplatesService,
  ],
})
export class EngagementModule {}
