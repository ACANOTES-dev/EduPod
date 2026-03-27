import { forwardRef, Module } from '@nestjs/common';

import { PastoralModule } from '../pastoral/pastoral.module';
import { S3Module } from '../s3/s3.module';
import { SearchModule } from '../search/search.module';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [S3Module, SearchModule, forwardRef(() => PastoralModule)],
  controllers: [ComplianceController],
  providers: [ComplianceService, AnonymisationService, AccessExportService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
