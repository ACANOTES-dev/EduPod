import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryController } from './regulatory.controller';

@Module({
  imports: [AuthModule],
  controllers: [RegulatoryController],
  providers: [
    RegulatoryCalendarService,
    RegulatoryDesMappingsService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTuslaMappingsService,
  ],
  exports: [
    RegulatoryCalendarService,
    RegulatoryDesMappingsService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTuslaMappingsService,
  ],
})
export class RegulatoryModule {}
