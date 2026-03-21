import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { S3Module } from '../s3/s3.module';

import { ImportProcessingService } from './import-processing.service';
import { ImportValidationService } from './import-validation.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

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
