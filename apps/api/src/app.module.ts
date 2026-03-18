import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

import { CommonModule } from './common/common.module';
import { TenantResolutionMiddleware } from './common/middleware/tenant-resolution.middleware';
import { AcademicsModule } from './modules/academics/academics.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ClassesModule } from './modules/classes/classes.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassRequirementsModule } from './modules/class-requirements/class-requirements.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HouseholdsModule } from './modules/households/households.module';
import { ParentsModule } from './modules/parents/parents.module';
import { ConfigModule } from './modules/config/config.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { HealthModule } from './modules/health/health.module';
import { PeriodGridModule } from './modules/period-grid/period-grid.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RedisModule } from './modules/redis/redis.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { S3Module } from './modules/s3/s3.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { SchoolClosuresModule } from './modules/school-closures/school-closures.module';
import { SearchModule } from './modules/search/search.module';
import { StaffAvailabilityModule } from './modules/staff-availability/staff-availability.module';
import { SchedulingRunsModule } from './modules/scheduling-runs/scheduling-runs.module';
import { StaffPreferencesModule } from './modules/staff-preferences/staff-preferences.module';
import { StaffProfilesModule } from './modules/staff-profiles/staff-profiles.module';
import { StudentsModule } from './modules/students/students.module';
import { GradebookModule } from './modules/gradebook/gradebook.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ParentInquiriesModule } from './modules/parent-inquiries/parent-inquiries.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PdfRenderingModule } from './modules/pdf-rendering/pdf-rendering.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ReportsModule } from './modules/reports/reports.module';
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
    RoomsModule,
    SchedulesModule,
    SchoolClosuresModule,
    AttendanceModule,
    HouseholdsModule,
    ParentsModule,
    SearchModule,
    DashboardModule,
    PeriodGridModule,
    ClassRequirementsModule,
    StaffAvailabilityModule,
    StaffPreferencesModule,
    SchedulingRunsModule,
    GradebookModule,
    PdfRenderingModule,
    FinanceModule,
    PayrollModule,
    CommunicationsModule,
    ParentInquiriesModule,
    WebsiteModule,
    AuditLogModule,
    ComplianceModule,
    ImportsModule,
    ReportsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'docs(.*)', method: RequestMethod.ALL },
        { path: 'v1/stripe/webhook', method: RequestMethod.POST },
        { path: 'v1/webhooks/(.*)', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
