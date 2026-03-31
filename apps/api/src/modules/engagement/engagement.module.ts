import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormSubmissionsService } from './form-submissions.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';
import { ParentFormsController } from './parent-forms.controller';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'engagement' })],
  controllers: [
    ConsentRecordsController,
    FormTemplatesController,
    FormSubmissionsController,
    ParentFormsController,
  ],
  providers: [ConsentRecordsService, FormTemplatesService, FormSubmissionsService],
  exports: [ConsentRecordsService, FormTemplatesService, FormSubmissionsService],
})
export class EngagementModule {}
