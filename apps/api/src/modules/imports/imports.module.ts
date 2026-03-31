import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { S3Module } from '../s3/s3.module';
import { TenantsModule } from '../tenants/tenants.module';

import { ImportExecutorService } from './import-executor.service';
import { ImportParserService } from './import-parser.service';
import { ImportProcessingService } from './import-processing.service';
import { ImportTemplateService } from './import-template.service';
import { ImportValidationService } from './import-validation.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [
    ConfigurationModule,
    S3Module,
    TenantsModule,
    BullModule.registerQueue({ name: 'imports' }),
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportValidationService,
    ImportParserService,
    ImportExecutorService,
    ImportProcessingService,
    ImportTemplateService,
  ],
  exports: [ImportService],
})
export class ImportsModule {}
