import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { S3Module } from '../s3/s3.module';

import { DesFileExporterCsv } from './adapters/des-file-exporter.csv';
import { DES_FILE_EXPORTER } from './adapters/des-file-exporter.interface';
import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryDesService } from './regulatory-des.service';
import { RegulatoryOctoberReturnsService } from './regulatory-october-returns.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryTuslaService } from './regulatory-tusla.service';
import { RegulatoryController } from './regulatory.controller';

@Module({
  imports: [AuthModule, S3Module],
  controllers: [RegulatoryController],
  providers: [
    { provide: DES_FILE_EXPORTER, useClass: DesFileExporterCsv },
    RegulatoryCalendarService,
    RegulatoryDesMappingsService,
    RegulatoryDesService,
    RegulatoryOctoberReturnsService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTuslaMappingsService,
    RegulatoryTuslaService,
  ],
  exports: [
    RegulatoryCalendarService,
    RegulatoryDesMappingsService,
    RegulatoryDesService,
    RegulatoryOctoberReturnsService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTuslaMappingsService,
    RegulatoryTuslaService,
  ],
})
export class RegulatoryModule {}
