import { forwardRef, Module } from '@nestjs/common';

import { GdprModule } from '../gdpr/gdpr.module';
import { PastoralModule } from '../pastoral/pastoral.module';
import { S3Module } from '../s3/s3.module';
import { SearchModule } from '../search/search.module';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { DsarTraversalService } from './dsar-traversal.service';
import { RetentionHoldsController, RetentionPoliciesController } from './retention-policies.controller';
import { RetentionPoliciesService } from './retention-policies.service';

@Module({
  imports: [S3Module, SearchModule, forwardRef(() => PastoralModule), GdprModule],
  controllers: [ComplianceController, RetentionPoliciesController, RetentionHoldsController],
  providers: [ComplianceService, AnonymisationService, AccessExportService, DsarTraversalService, RetentionPoliciesService],
  exports: [ComplianceService, RetentionPoliciesService],
})
export class ComplianceModule {}
