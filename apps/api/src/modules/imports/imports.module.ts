import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { S3Module } from '../s3/s3.module';

import { ImportController } from './import.controller';
import { ImportProcessingService } from './import-processing.service';
import { ImportService } from './import.service';
import { ImportValidationService } from './import-validation.service';

@Module({
  imports: [
    S3Module,
    BullModule.registerQueue({ name: 'imports' }),
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportValidationService, ImportProcessingService],
  exports: [ImportService],
})
export class ImportsModule {}
