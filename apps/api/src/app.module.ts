import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

import { CommonModule } from './common/common.module';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { TenantResolutionMiddleware } from './common/middleware/tenant-resolution.middleware';
import { AcademicsModule } from './modules/academics/academics.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { BehaviourModule } from './modules/behaviour/behaviour.module';
import { ChildProtectionModule } from './modules/child-protection/child-protection.module';
import { ClassRequirementsModule } from './modules/class-requirements/class-requirements.module';
import { ClassesModule } from './modules/classes/classes.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ConfigModule } from './modules/config/config.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { CriticalIncidentsModule } from './modules/critical-incidents/critical-incidents.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EarlyWarningModule } from './modules/early-warning/early-warning.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { GradebookModule } from './modules/gradebook/gradebook.module';
import { HealthModule } from './modules/health/health.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { HouseholdsModule } from './modules/households/households.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ParentInquiriesModule } from './modules/parent-inquiries/parent-inquiries.module';
import { ParentsModule } from './modules/parents/parents.module';
import { PastoralModule } from './modules/pastoral/pastoral.module';
import { PastoralCheckinsModule } from './modules/pastoral-checkins/pastoral-checkins.module';
import { PastoralDsarModule } from './modules/pastoral-dsar/pastoral-dsar.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PdfRenderingModule } from './modules/pdf-rendering/pdf-rendering.module';
import { PeriodGridModule } from './modules/period-grid/period-grid.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RedisModule } from './modules/redis/redis.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { RegulatoryModule } from './modules/regulatory/regulatory.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { S3Module } from './modules/s3/s3.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { SchedulingRunsModule } from './modules/scheduling-runs/scheduling-runs.module';
import { SchoolClosuresModule } from './modules/school-closures/school-closures.module';
import { SearchModule } from './modules/search/search.module';
import { SecurityIncidentsModule } from './modules/security-incidents/security-incidents.module';
import { StaffAvailabilityModule } from './modules/staff-availability/staff-availability.module';
import { StaffPreferencesModule } from './modules/staff-preferences/staff-preferences.module';
import { StaffProfilesModule } from './modules/staff-profiles/staff-profiles.module';
import { StaffWellbeingModule } from './modules/staff-wellbeing/staff-wellbeing.module';
import { StudentsModule } from './modules/students/students.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { WebsiteModule } from './modules/website/website.module';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const url = new URL(configService.get<string>('REDIS_URL')!);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            password: url.password ? decodeURIComponent(url.password) : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'pastoral' }),
    PrismaModule,
    RedisModule,
    CommonModule,
    HealthModule,
    AuthModule,
    S3Module,
    TenantsModule,
    ConfigurationModule,
    PreferencesModule,
    RbacModule,
    ApprovalsModule,
    AdmissionsModule,
    StaffProfilesModule,
    AcademicsModule,
    StudentsModule,
    ClassesModule,
    ChildProtectionModule,
    RoomsModule,
    SchedulesModule,
    RegulatoryModule,
    SchoolClosuresModule,
    AttendanceModule,
    BehaviourModule,
    CriticalIncidentsModule,
    HomeworkModule,
    HouseholdsModule,
    ParentsModule,
    PastoralModule,
    PastoralCheckinsModule,
    PastoralDsarModule,
    SearchModule,
    DashboardModule,
    EarlyWarningModule,
    PeriodGridModule,
    ClassRequirementsModule,
    StaffAvailabilityModule,
    StaffPreferencesModule,
    SchedulingRunsModule,
    GradebookModule,
    PdfRenderingModule,
    FinanceModule,
    GdprModule,
    PayrollModule,
    CommunicationsModule,
    ParentInquiriesModule,
    WebsiteModule,
    AuditLogModule,
    ComplianceModule,
    ImportsModule,
    ReportsModule,
    RegistrationModule,
    SchedulingModule,
    StaffWellbeingModule,
    SecurityIncidentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Correlation middleware runs first — assigns X-Request-Id before any other middleware
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes('*');

    consumer
      .apply(TenantResolutionMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/(.*)', method: RequestMethod.ALL },
        { path: 'docs(.*)', method: RequestMethod.ALL },
        { path: 'v1/stripe/webhook', method: RequestMethod.POST },
        { path: 'v1/webhooks/(.*)', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
