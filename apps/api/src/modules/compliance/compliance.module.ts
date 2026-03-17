import { Module } from '@nestjs/common';

import { S3Module } from '../s3/s3.module';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [S3Module],
  controllers: [ComplianceController],
  providers: [ComplianceService, AnonymisationService, AccessExportService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
