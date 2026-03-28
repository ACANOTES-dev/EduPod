import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { S3Module } from '../s3/s3.module';

import { DesFileExporterCsv } from './adapters/des-file-exporter.csv';
import { DES_FILE_EXPORTER } from './adapters/des-file-exporter.interface';
import { CsvExportTransport } from './adapters/pod-transport.csv-export';
import { CsvImportTransport } from './adapters/pod-transport.csv-import';
import type { PodTransport } from './adapters/pod-transport.interface';
import { POD_TRANSPORT } from './adapters/pod-transport.interface';
import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryCbaService } from './regulatory-cba.service';
import { RegulatoryDashboardService } from './regulatory-dashboard.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryDesService } from './regulatory-des.service';
import { RegulatoryOctoberReturnsService } from './regulatory-october-returns.service';
import { RegulatoryPpodService } from './regulatory-ppod.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTransfersService } from './regulatory-transfers.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryTuslaService } from './regulatory-tusla.service';
import { RegulatoryController } from './regulatory.controller';

@Module({
  imports: [AuthModule, S3Module],
  controllers: [RegulatoryController],
  providers: [
    { provide: DES_FILE_EXPORTER, useClass: DesFileExporterCsv },
    CsvImportTransport,
    CsvExportTransport,
    {
      provide: POD_TRANSPORT,
      useFactory: (csvImport: CsvImportTransport, csvExport: CsvExportTransport): PodTransport => ({
        pull: (content) => csvImport.pull(content),
        push: (records) => csvExport.push(records),
      }),
      inject: [CsvImportTransport, CsvExportTransport],
    },
    RegulatoryCalendarService,
    RegulatoryCbaService,
    RegulatoryDashboardService,
    RegulatoryDesMappingsService,
    RegulatoryDesService,
    RegulatoryOctoberReturnsService,
    RegulatoryPpodService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTransfersService,
    RegulatoryTuslaMappingsService,
    RegulatoryTuslaService,
  ],
  exports: [
    RegulatoryCalendarService,
    RegulatoryCbaService,
    RegulatoryDashboardService,
    RegulatoryDesMappingsService,
    RegulatoryDesService,
    RegulatoryOctoberReturnsService,
    RegulatoryPpodService,
    RegulatoryReducedDaysService,
    RegulatorySubmissionService,
    RegulatoryTransfersService,
    RegulatoryTuslaMappingsService,
    RegulatoryTuslaService,
  ],
})
export class RegulatoryModule {}
