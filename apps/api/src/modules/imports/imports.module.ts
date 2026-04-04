import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { HouseholdsModule } from '../households/households.module';
import { ParentsModule } from '../parents/parents.module';
import { S3Module } from '../s3/s3.module';
import { SequenceModule } from '../sequence/sequence.module';
import { StudentsModule } from '../students/students.module';

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
    HouseholdsModule,
    ParentsModule,
    S3Module,
    SequenceModule,
    StudentsModule,
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
