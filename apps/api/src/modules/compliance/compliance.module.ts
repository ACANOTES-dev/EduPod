import { forwardRef, Module } from '@nestjs/common';

import { AdmissionsModule } from '../admissions/admissions.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { BehaviourModule } from '../behaviour/behaviour.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { FinanceModule } from '../finance/finance.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { HouseholdsModule } from '../households/households.module';
import { ParentInquiriesModule } from '../parent-inquiries/parent-inquiries.module';
import { ParentsModule } from '../parents/parents.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { PayrollModule } from '../payroll/payroll.module';
import { RbacModule } from '../rbac/rbac.module';
import { S3Module } from '../s3/s3.module';
import { SearchModule } from '../search/search.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { WebsiteModule } from '../website/website.module';

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
    forwardRef(() => StudentsModule),
    forwardRef(() => ParentsModule),
    forwardRef(() => HouseholdsModule),
    forwardRef(() => StaffProfilesModule),
    forwardRef(() => AdmissionsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => RbacModule),
    forwardRef(() => AttendanceModule),
    forwardRef(() => ClassesModule),
    forwardRef(() => AuditLogModule),
    forwardRef(() => CommunicationsModule),
    forwardRef(() => ParentInquiriesModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => WebsiteModule),
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
