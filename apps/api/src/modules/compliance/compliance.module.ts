import { Module } from '@nestjs/common';

import { BehaviourModule } from '../behaviour/behaviour.module';
import { FinanceModule } from '../finance/finance.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { S3Module } from '../s3/s3.module';
import { SearchModule } from '../search/search.module';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { DsarTraversalService } from './dsar-traversal.service';
import {
  RetentionHoldsController,
  RetentionPoliciesController,
} from './retention-policies.controller';
import { RetentionPoliciesService } from './retention-policies.service';

@Module({
  imports: [
    S3Module,
    SearchModule,
    PastoralCoreModule,
    GdprModule,
    FinanceModule,
    GradebookModule,
    BehaviourModule,
  ],
  controllers: [ComplianceController, RetentionPoliciesController, RetentionHoldsController],
  providers: [
    ComplianceService,
    AnonymisationService,
    AccessExportService,
    DsarTraversalService,
    RetentionPoliciesService,
  ],
  exports: [ComplianceService, RetentionPoliciesService],
})
export class ComplianceModule {}
