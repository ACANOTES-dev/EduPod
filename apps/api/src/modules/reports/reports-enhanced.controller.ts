import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  admissionsAnalyticsQuerySchema,
  aiNarratorSchema,
  aiPredictSchema,
  attendanceAnalyticsQuerySchema,
  boardReportsQuerySchema,
  cohortTrendsQuerySchema,
  createBoardReportSchema,
  createComplianceTemplateSchema,
  createReportAlertSchema,
  createSavedReportSchema,
  createScheduledReportSchema,
  demographicsQuerySchema,
  executeSavedReportSchema,
  gradeAnalyticsQuerySchema,
  reportAlertsQuerySchema,
  reportExportQuerySchema,
  savedReportsQuerySchema,
  scheduledReportsQuerySchema,
  studentProgressQuerySchema,
  subjectDifficultyQuerySchema,
  updateComplianceTemplateSchema,
  updateReportAlertSchema,
  updateSavedReportSchema,
  updateScheduledReportSchema,
  yearGroupTrendQuerySchema,
} from '@school/shared';
import {
  boardReportRequestSchema,
  dashboardNarrationRequestSchema,
  previewQuerySchema,
  reportNarrationRequestSchema,
  savedReportNarrationRequestSchema,
} from '@school/shared/reports';
import type {
  BoardReportRequest,
  DashboardNarrationRequestDto,
  PreviewQueryDto,
  ReportNarrationRequestDto,
  SavedReportNarrationRequestDto,
} from '@school/shared/reports';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { RequiresAiFlag } from '../ai-flags/decorators/requires-ai-flag.decorator';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { AiPredictionsService } from './ai-predictions.service';
import { AiReportNarratorService } from './ai-report-narrator.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { BoardReportService } from './board-report.service';
import { ComplianceReportService } from './compliance-report.service';
import { CrossModuleInsightsService } from './cross-module-insights.service';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { DemographicsService } from './demographics.service';
import { GradeAnalyticsService } from './grade-analytics.service';
import { QueryEngineService } from './query-engine/query-engine.service';
import { ReportAlertsService } from './report-alerts.service';
import { LegacyReportExportService } from './report-export.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { StudentProgressService } from './student-progress.service';
import { OWNER_SENTINEL_PERMISSION } from './subject-registry/reports-subject-registry.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

/**
 * Normalise a service return value to `{ data, meta }` for the Wave 4 UI
 * contract. `meta.generated_at` is always set at response-construction time.
 * Consumed by the `ResponseTransformInterceptor` which sees `data` on the
 * envelope and passes it through without double-wrapping.
 */
function wrap<T>(data: T): { data: T; meta: { generated_at: string } } {
  return { data, meta: { generated_at: new Date().toISOString() } };
}

@Controller('v1/reports')
@UseGuards(AuthGuard, PermissionGuard)
@SensitiveDataAccess('analytics')
export class ReportsEnhancedController {
  constructor(
    private readonly unifiedDashboard: UnifiedDashboardService,
    private readonly crossModuleInsights: CrossModuleInsightsService,
    private readonly attendanceAnalytics: AttendanceAnalyticsService,
    private readonly gradeAnalytics: GradeAnalyticsService,
    private readonly demographics: DemographicsService,
    private readonly studentProgress: StudentProgressService,
    private readonly admissionsAnalytics: AdmissionsAnalyticsService,
    private readonly staffAnalytics: StaffAnalyticsService,
    private readonly customReportBuilder: CustomReportBuilderService,
    private readonly boardReport: BoardReportService,
    private readonly complianceReport: ComplianceReportService,
    private readonly scheduledReports: ScheduledReportsService,
    private readonly reportAlerts: ReportAlertsService,
    private readonly aiNarrator: AiReportNarratorService,
    private readonly aiPredictions: AiPredictionsService,
    private readonly reportExport: LegacyReportExportService,
    private readonly queryEngine: QueryEngineService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // ─── Unified KPI Dashboard ─────────────────────────────────────────────────

  // GET /v1/reports/analytics/dashboard — the frontend's entry point for
  // the rebuilt hub. Returns the new 10-KPI shape (see PLAN.md §3 + impl
  // 03). `/v1/reports/kpi-dashboard` is kept as a transitional alias;
  // both delegate to the same service method.
  @Get('analytics/dashboard')
  @RequiresPermission('analytics.view')
  async analyticsDashboard(
    @CurrentTenant() tenant: TenantContext,
    @Query('refresh') refresh?: string,
  ) {
    return this.unifiedDashboard.getKpiDashboard(tenant.tenant_id, refresh === 'true');
  }

  @Get('kpi-dashboard')
  @RequiresPermission('analytics.view')
  async kpiDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.unifiedDashboard.getKpiDashboard(tenant.tenant_id);
  }

  // ─── Cross-Module Insights ────────────────────────────────────────────────

  @Get('insights/attendance-vs-grades')
  @RequiresPermission('analytics.view')
  async attendanceVsGrades(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.crossModuleInsights.attendanceVsGrades(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('insights/cost-per-student')
  @RequiresPermission('analytics.view')
  async costPerStudent(@CurrentTenant() tenant: TenantContext) {
    return this.crossModuleInsights.costPerStudent(tenant.tenant_id);
  }

  @Get('insights/year-group-health')
  @RequiresPermission('analytics.view')
  async yearGroupHealth(@CurrentTenant() tenant: TenantContext) {
    return this.crossModuleInsights.yearGroupHealthScores(tenant.tenant_id);
  }

  @Get('insights/teacher-effectiveness')
  @RequiresPermission('analytics.view')
  async teacherEffectiveness(@CurrentTenant() tenant: TenantContext) {
    return this.crossModuleInsights.teacherEffectivenessIndex(tenant.tenant_id);
  }

  // ─── Attendance Analytics ─────────────────────────────────────────────────

  @Get('analytics/attendance/chronic-absenteeism')
  @RequiresPermission('analytics.view')
  async chronicAbsenteeism(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(attendanceAnalyticsQuerySchema))
    query: z.infer<typeof attendanceAnalyticsQuerySchema>,
  ) {
    return this.attendanceAnalytics.chronicAbsenteeism(
      tenant.tenant_id,
      query.threshold,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/attendance/day-of-week-heatmap')
  @RequiresPermission('analytics.view')
  async dayOfWeekHeatmap(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(attendanceAnalyticsQuerySchema))
    query: z.infer<typeof attendanceAnalyticsQuerySchema>,
  ) {
    return this.attendanceAnalytics.dayOfWeekHeatmap(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/attendance/teacher-compliance')
  @RequiresPermission('analytics.view')
  async teacherMarkingCompliance(@CurrentTenant() tenant: TenantContext) {
    return this.attendanceAnalytics.teacherMarkingCompliance(tenant.tenant_id);
  }

  @Get('analytics/attendance/trends')
  @RequiresPermission('analytics.view')
  async attendanceTrends(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(attendanceAnalyticsQuerySchema))
    query: z.infer<typeof attendanceAnalyticsQuerySchema>,
  ) {
    return this.attendanceAnalytics.attendanceTrends(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/attendance/excused-vs-unexcused')
  @RequiresPermission('analytics.view')
  async excusedVsUnexcused(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(attendanceAnalyticsQuerySchema))
    query: z.infer<typeof attendanceAnalyticsQuerySchema>,
  ) {
    return this.attendanceAnalytics.excusedVsUnexcused(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
      query.year_group_id,
    );
  }

  @Get('analytics/attendance/class-comparison/:yearGroupId')
  @RequiresPermission('analytics.view')
  async classComparison(
    @CurrentTenant() tenant: TenantContext,
    @Param('yearGroupId', ParseUUIDPipe) yearGroupId: string,
    @Query(new ZodValidationPipe(attendanceAnalyticsQuerySchema))
    query: z.infer<typeof attendanceAnalyticsQuerySchema>,
  ) {
    return this.attendanceAnalytics.classComparison(
      tenant.tenant_id,
      yearGroupId,
      query.start_date,
      query.end_date,
    );
  }

  // ─── Grade Analytics ──────────────────────────────────────────────────────

  @Get('analytics/grades/pass-fail-rates')
  @RequiresPermission('analytics.view')
  async passFailRates(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gradeAnalyticsQuerySchema))
    query: z.infer<typeof gradeAnalyticsQuerySchema>,
  ) {
    return this.gradeAnalytics.passFailRates(
      tenant.tenant_id,
      query.year_group_id,
      query.subject_id,
      query.academic_period_id,
    );
  }

  @Get('analytics/grades/distribution')
  @RequiresPermission('analytics.view')
  async gradeDistribution(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gradeAnalyticsQuerySchema))
    query: z.infer<typeof gradeAnalyticsQuerySchema>,
  ) {
    return this.gradeAnalytics.gradeDistribution(
      tenant.tenant_id,
      query.year_group_id,
      query.subject_id,
      query.academic_period_id,
    );
  }

  @Get('analytics/grades/top-bottom-performers')
  @RequiresPermission('analytics.view')
  async topBottomPerformers(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gradeAnalyticsQuerySchema))
    query: z.infer<typeof gradeAnalyticsQuerySchema>,
  ) {
    return this.gradeAnalytics.topBottomPerformers(
      tenant.tenant_id,
      10,
      query.year_group_id,
      query.subject_id,
    );
  }

  @Get('analytics/grades/trends')
  @RequiresPermission('analytics.view')
  async gradeTrends(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gradeAnalyticsQuerySchema))
    query: z.infer<typeof gradeAnalyticsQuerySchema>,
  ) {
    return this.gradeAnalytics.gradeTrends(tenant.tenant_id, query.year_group_id, query.subject_id);
  }

  // GET /v1/reports/analytics/grades/subject-difficulty
  //
  // Default mode returns `SubjectDifficultyEntry[]` — one row per subject.
  // When `?by=term&subject_id=<uuid>` is passed, returns
  // `SubjectDifficultyTrendEntry[]` — one row per academic period for the
  // named subject, oldest→newest, capped at `?terms=N` when provided.
  // Impl 15's "Subject Difficulty" chart uses the trend mode.
  @Get('analytics/grades/subject-difficulty')
  @RequiresPermission('analytics.view')
  async subjectDifficulty(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(subjectDifficultyQuerySchema))
    query: z.infer<typeof subjectDifficultyQuerySchema>,
  ) {
    if (query.by === 'term') {
      if (!query.subject_id) {
        throw new BadRequestException({
          code: 'SUBJECT_ID_REQUIRED',
          message: 'subject_id is required when by=term',
        });
      }
      const trend = await this.gradeAnalytics.subjectDifficultyTrend(
        tenant.tenant_id,
        query.subject_id,
        query.terms,
        query.year_group_id,
      );
      return wrap(trend);
    }
    const data = await this.gradeAnalytics.subjectDifficulty(tenant.tenant_id, query.year_group_id);
    return wrap(data);
  }

  @Get('analytics/grades/gpa-distribution')
  @RequiresPermission('analytics.view')
  async gpaDistribution(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gradeAnalyticsQuerySchema))
    query: z.infer<typeof gradeAnalyticsQuerySchema>,
  ) {
    return this.gradeAnalytics.gpaDistribution(tenant.tenant_id, query.year_group_id);
  }

  // ─── Demographics ─────────────────────────────────────────────────────────

  @Get('analytics/demographics/nationality')
  @RequiresPermission('analytics.view')
  async nationalityBreakdown(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(demographicsQuerySchema))
    query: z.infer<typeof demographicsQuerySchema>,
  ) {
    return this.demographics.nationalityBreakdown(tenant.tenant_id, query.year_group_id);
  }

  @Get('analytics/demographics/gender-balance')
  @RequiresPermission('analytics.view')
  async genderBalance(@CurrentTenant() tenant: TenantContext) {
    return this.demographics.genderBalance(tenant.tenant_id);
  }

  @Get('analytics/demographics/age-distribution')
  @RequiresPermission('analytics.view')
  async ageDistribution(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(demographicsQuerySchema))
    query: z.infer<typeof demographicsQuerySchema>,
  ) {
    return this.demographics.ageDistribution(tenant.tenant_id, query.year_group_id);
  }

  @Get('analytics/demographics/year-group-sizes')
  @RequiresPermission('analytics.view')
  async yearGroupSizes(@CurrentTenant() tenant: TenantContext) {
    return this.demographics.yearGroupSizes(tenant.tenant_id);
  }

  @Get('analytics/demographics/enrolment-trends')
  @RequiresPermission('analytics.view')
  async enrolmentTrends(@CurrentTenant() tenant: TenantContext) {
    return this.demographics.enrolmentTrends(tenant.tenant_id);
  }

  @Get('analytics/demographics/status-distribution')
  @RequiresPermission('analytics.view')
  async statusDistribution(@CurrentTenant() tenant: TenantContext) {
    return this.demographics.statusDistribution(tenant.tenant_id);
  }

  // GET /v1/reports/analytics/demographics/year-group-enrolment/:yearGroupId
  //
  // Drill-down from the year-group-sizes view. Returns month-over-month
  // headcount plus entries/exits for the given year group across the
  // trailing `months` (default 12, max 36).
  @Get('analytics/demographics/year-group-enrolment/:yearGroupId')
  @RequiresPermission('analytics.view')
  async yearGroupEnrolmentTrend(
    @CurrentTenant() tenant: TenantContext,
    @Param('yearGroupId', ParseUUIDPipe) yearGroupId: string,
    @Query(new ZodValidationPipe(yearGroupTrendQuerySchema))
    query: z.infer<typeof yearGroupTrendQuerySchema>,
  ) {
    const data = await this.demographics.getEnrolmentTrendByYearGroup(
      tenant.tenant_id,
      yearGroupId,
      query.months,
    );
    return wrap(data);
  }

  // ─── Student Progress ─────────────────────────────────────────────────────

  @Get('analytics/student-progress')
  @RequiresPermission('analytics.view')
  async getStudentProgress(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(studentProgressQuerySchema))
    query: z.infer<typeof studentProgressQuerySchema>,
  ) {
    return this.studentProgress.getStudentProgress(tenant.tenant_id, query.student_id);
  }

  // GET /v1/reports/analytics/student-progress/trends-by-cohort/:yearGroupId
  //
  // Cohort-level attendance + grade trend for a single year group across a
  // single academic period. `academic_period_id` is required as a query
  // param — no implicit "current" fallback because the academic-period
  // resolution rule belongs to the caller.
  @Get('analytics/student-progress/trends-by-cohort/:yearGroupId')
  @RequiresPermission('analytics.view')
  async getTrendsByCohort(
    @CurrentTenant() tenant: TenantContext,
    @Param('yearGroupId', ParseUUIDPipe) yearGroupId: string,
    @Query(new ZodValidationPipe(cohortTrendsQuerySchema))
    query: z.infer<typeof cohortTrendsQuerySchema>,
  ) {
    const data = await this.studentProgress.getTrendsByCohort(
      tenant.tenant_id,
      yearGroupId,
      query.academic_period_id,
    );
    return wrap(data);
  }

  // GET /v1/reports/analytics/student-progress/at-risk-new-this-week
  //
  // Drill-down for KPI #3 — list of students newly flagged at-risk this
  // ISO week (Sunday 00:00 → now). Deduplicated by student, newest first.
  @Get('analytics/student-progress/at-risk-new-this-week')
  @RequiresPermission('analytics.view')
  async atRiskNewThisWeek(@CurrentTenant() tenant: TenantContext) {
    const data = await this.studentProgress.listAtRiskStudentsNewThisWeek(tenant.tenant_id);
    return wrap(data);
  }

  // ─── Admissions Analytics ─────────────────────────────────────────────────

  @Get('analytics/admissions/funnel')
  @RequiresPermission('analytics.view')
  async admissionsFunnel(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.admissionsAnalytics.pipelineFunnel(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/admissions/processing-time')
  @RequiresPermission('analytics.view')
  async admissionsProcessingTime(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.admissionsAnalytics.processingTime(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/admissions/rejection-reasons')
  @RequiresPermission('analytics.view')
  async rejectionReasons(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.admissionsAnalytics.rejectionReasons(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/admissions/monthly')
  @RequiresPermission('analytics.view')
  async monthlyApplications(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.admissionsAnalytics.monthlyApplications(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  @Get('analytics/admissions/year-group-demand')
  @RequiresPermission('analytics.view')
  async yearGroupDemand(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsQuerySchema))
    query: z.infer<typeof admissionsAnalyticsQuerySchema>,
  ) {
    return this.admissionsAnalytics.yearGroupDemand(
      tenant.tenant_id,
      query.start_date,
      query.end_date,
    );
  }

  // ─── Staff Analytics ──────────────────────────────────────────────────────

  @Get('analytics/staff/headcount')
  @RequiresPermission('analytics.view')
  async staffHeadcount(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.headcountByDepartment(tenant.tenant_id);
  }

  @Get('analytics/staff/ratio')
  @RequiresPermission('analytics.view')
  async staffStudentRatio(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.staffStudentRatio(tenant.tenant_id);
  }

  @Get('analytics/staff/tenure')
  @RequiresPermission('analytics.view')
  async tenureDistribution(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.tenureDistribution(tenant.tenant_id);
  }

  @Get('analytics/staff/attendance')
  @RequiresPermission('analytics.view')
  async staffAttendanceRate(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.staffAttendanceRate(tenant.tenant_id);
  }

  @Get('analytics/staff/qualification-coverage')
  @RequiresPermission('analytics.view')
  async qualificationCoverage(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.qualificationCoverage(tenant.tenant_id);
  }

  @Get('analytics/staff/compensation-distribution')
  @RequiresPermission('analytics.view')
  async compensationDistribution(@CurrentTenant() tenant: TenantContext) {
    return this.staffAnalytics.compensationDistribution(tenant.tenant_id);
  }

  // ─── Custom Report Builder ────────────────────────────────────────────────

  @Get('builder')
  @RequiresPermission('analytics.manage_reports')
  async listSavedReports(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(savedReportsQuerySchema))
    query: z.infer<typeof savedReportsQuerySchema>,
  ) {
    return this.customReportBuilder.listSavedReports(
      tenant.tenant_id,
      user.sub,
      query.include_shared,
      query.page,
      query.pageSize,
    );
  }

  @Get('builder/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async getSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.customReportBuilder.getSavedReport(tenant.tenant_id, reportId);
  }

  @Post('builder')
  @RequiresPermission('analytics.manage_reports')
  async createSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSavedReportSchema))
    body: z.infer<typeof createSavedReportSchema>,
  ) {
    return this.customReportBuilder.createSavedReport(tenant.tenant_id, user.sub, body);
  }

  @Put('builder/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async updateSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(updateSavedReportSchema))
    body: z.infer<typeof updateSavedReportSchema>,
  ) {
    return this.customReportBuilder.updateSavedReport(tenant.tenant_id, reportId, body);
  }

  @Delete('builder/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async deleteSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.customReportBuilder.deleteSavedReport(tenant.tenant_id, reportId);
  }

  @Get('builder/:reportId/execute')
  @RequiresPermission('analytics.manage_reports', 'reports.builder')
  async executeReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Query(new ZodValidationPipe(executeSavedReportSchema))
    query: z.infer<typeof executeSavedReportSchema>,
  ) {
    const permissions = await this.resolveBuilderPermissions(user);
    return this.customReportBuilder.executeReport(
      tenant.tenant_id,
      user.sub,
      permissions,
      reportId,
      query.page,
      query.pageSize,
    );
  }

  // POST /v1/reports/builder/preview — fires on every debounced builder
  // edit. Body carries the current in-progress query. The engine returns
  // a 50-row preview with row-cap + timeout + permission guardrails.
  @Post('builder/preview')
  @RequiresPermission('analytics.manage_reports', 'reports.builder')
  async previewReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(previewQuerySchema)) body: PreviewQueryDto,
  ) {
    const permissions = await this.resolveBuilderPermissions(user);
    return this.queryEngine.execute(tenant.tenant_id, user.sub, permissions, body.query, {
      page: 1,
      pageSize: 50,
    });
  }

  /**
   * Resolve the caller's effective permissions including the owner-bypass
   * sentinel for `school_owner` / `school_principal` /
   * `school_vice_principal`. Consumed by the subject registry's field
   * scoping and by the query engine's field validator.
   */
  private async resolveBuilderPermissions(user: JwtPayload): Promise<string[]> {
    if (!user.membership_id) return [];
    const [permissions, owner] = await Promise.all([
      this.permissionCache.getPermissions(user.membership_id),
      this.permissionCache.isOwner(user.membership_id),
    ]);
    return owner ? [...permissions, OWNER_SENTINEL_PERMISSION] : permissions;
  }

  // ─── Board Reports ────────────────────────────────────────────────────────

  // The static `board/history` route MUST appear before `board/:reportId`:
  // Express matches routes in registration order and the dynamic segment
  // otherwise intercepts `/board/history` with a `ParseUUIDPipe` 400.

  // GET /v1/reports/board — legacy paginated list of persisted board
  // reports. Impl 20 (Board UI) migrates to `board/history`; keeping this
  // alive until that landing so the current admin UI doesn't break.
  @Get('board')
  @RequiresPermission('analytics.view_board_reports')
  async listBoardReports(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(boardReportsQuerySchema))
    query: z.infer<typeof boardReportsQuerySchema>,
  ) {
    return this.boardReport.listBoardReports(tenant.tenant_id, query.page, query.pageSize);
  }

  // GET /v1/reports/board/history — new history endpoint returning
  // BoardReportHistoryEntry rows: term label, sections included, anonymise
  // flag, generator name. Consumed by impl 21 (Reports Settings page) so
  // an admin can re-download a prior packet.
  @Get('board/history')
  @RequiresPermission('analytics.view_board_reports')
  async listBoardReportHistory(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(boardReportsQuerySchema))
    query: z.infer<typeof boardReportsQuerySchema>,
  ) {
    return this.boardReport.listHistory(tenant.tenant_id, query.page, query.pageSize);
  }

  @Get('board/:reportId')
  @RequiresPermission('analytics.view_board_reports')
  async getBoardReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.boardReport.getBoardReport(tenant.tenant_id, reportId);
  }

  // POST /v1/reports/board — generate a Board Report packet.
  //
  // The body follows the new `boardReportRequestSchema`:
  //   { term: { academic_year_id, term_number }, sections[], anonymise }
  // Legacy payload shape (`{ title, academic_period_id, report_type,
  // sections_json }`) is detected by the presence of `sections_json` /
  // `report_type` / `title` and falls through to the legacy path so the
  // existing admin UI keeps working until impl 20 ships.
  @Post('board')
  @RequiresPermission('analytics.view_board_reports')
  async generateBoardReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() rawBody: unknown,
  ) {
    if (this.isLegacyBoardReportBody(rawBody)) {
      const legacyParsed = createBoardReportSchema.parse(rawBody);
      return this.boardReport.generateBoardReport(tenant.tenant_id, user.sub, legacyParsed);
    }

    const parsed = boardReportRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'BOARD_REPORT_INVALID_BODY',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const body: BoardReportRequest = parsed.data;

    const boardReport = await this.boardReport.generate(tenant.tenant_id, user.sub, body);
    return {
      data: boardReport,
      meta: {
        generated_at: boardReport.generated_at,
        generated_by: boardReport.generated_by_user_id,
      },
    };
  }

  @Delete('board/:reportId')
  @RequiresPermission('analytics.view_board_reports')
  async deleteBoardReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.boardReport.deleteBoardReport(tenant.tenant_id, reportId);
  }

  private isLegacyBoardReportBody(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const o = body as Record<string, unknown>;
    return 'sections_json' in o || 'report_type' in o || 'title' in o;
  }

  // ─── Compliance Report Templates ─────────────────────────────────────────

  @Get('compliance/templates')
  @RequiresPermission('analytics.manage_compliance')
  async listComplianceTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.complianceReport.listTemplates(tenant.tenant_id);
  }

  @Get('compliance/templates/:templateId')
  @RequiresPermission('analytics.manage_compliance')
  async getComplianceTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.complianceReport.getTemplate(tenant.tenant_id, templateId);
  }

  @Post('compliance/templates')
  @RequiresPermission('analytics.manage_compliance')
  async createComplianceTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createComplianceTemplateSchema))
    body: z.infer<typeof createComplianceTemplateSchema>,
  ) {
    return this.complianceReport.createTemplate(tenant.tenant_id, body);
  }

  @Put('compliance/templates/:templateId')
  @RequiresPermission('analytics.manage_compliance')
  async updateComplianceTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(new ZodValidationPipe(updateComplianceTemplateSchema))
    body: z.infer<typeof updateComplianceTemplateSchema>,
  ) {
    return this.complianceReport.updateTemplate(tenant.tenant_id, templateId, body);
  }

  @Delete('compliance/templates/:templateId')
  @RequiresPermission('analytics.manage_compliance')
  async deleteComplianceTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.complianceReport.deleteTemplate(tenant.tenant_id, templateId);
  }

  @Get('compliance/templates/:templateId/populate')
  @RequiresPermission('analytics.manage_compliance')
  async populateComplianceReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.complianceReport.autoPopulate(tenant.tenant_id, templateId);
  }

  // ─── Scheduled Reports ───────────────────────────────────────────────────

  @Get('scheduled')
  @RequiresPermission('analytics.manage_reports')
  async listScheduledReports(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(scheduledReportsQuerySchema))
    query: z.infer<typeof scheduledReportsQuerySchema>,
  ) {
    return this.scheduledReports.list(tenant.tenant_id, query.page, query.pageSize);
  }

  @Get('scheduled/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async getScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.scheduledReports.get(tenant.tenant_id, reportId);
  }

  @Post('scheduled')
  @RequiresPermission('analytics.manage_reports')
  async createScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createScheduledReportSchema))
    body: z.infer<typeof createScheduledReportSchema>,
  ) {
    return this.scheduledReports.create(tenant.tenant_id, user.sub, body);
  }

  @Put('scheduled/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async updateScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(updateScheduledReportSchema))
    body: z.infer<typeof updateScheduledReportSchema>,
  ) {
    return this.scheduledReports.update(tenant.tenant_id, reportId, body);
  }

  @Delete('scheduled/:reportId')
  @RequiresPermission('analytics.manage_reports')
  async deleteScheduledReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.scheduledReports.delete(tenant.tenant_id, reportId);
  }

  // ─── Report Alerts ────────────────────────────────────────────────────────

  @Get('alerts')
  @RequiresPermission('analytics.manage_reports')
  async listReportAlerts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportAlertsQuerySchema))
    query: z.infer<typeof reportAlertsQuerySchema>,
  ) {
    return this.reportAlerts.list(tenant.tenant_id, query.page, query.pageSize);
  }

  @Get('alerts/:alertId')
  @RequiresPermission('analytics.manage_reports')
  async getReportAlert(
    @CurrentTenant() tenant: TenantContext,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.reportAlerts.get(tenant.tenant_id, alertId);
  }

  @Post('alerts')
  @RequiresPermission('analytics.manage_reports')
  async createReportAlert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createReportAlertSchema))
    body: z.infer<typeof createReportAlertSchema>,
  ) {
    return this.reportAlerts.create(tenant.tenant_id, user.sub, body);
  }

  @Put('alerts/:alertId')
  @RequiresPermission('analytics.manage_reports')
  async updateReportAlert(
    @CurrentTenant() tenant: TenantContext,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body(new ZodValidationPipe(updateReportAlertSchema))
    body: z.infer<typeof updateReportAlertSchema>,
  ) {
    return this.reportAlerts.update(tenant.tenant_id, alertId, body);
  }

  @Delete('alerts/:alertId')
  @RequiresPermission('analytics.manage_reports')
  async deleteReportAlert(
    @CurrentTenant() tenant: TenantContext,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.reportAlerts.delete(tenant.tenant_id, alertId);
  }

  // GET /v1/reports/alerts/:alertId/history (impl 09)
  // Lists the last N `report_alert_runs` rows for an alert. Consumed by
  // the alerts management UI (impl 17). Permission scoped to view, not
  // manage — admins can read history without holding the manage role.
  @Get('alerts/:alertId/history')
  @RequiresPermission('analytics.view')
  async getReportAlertHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 50,
  ) {
    return this.reportAlerts.getHistory(tenant.tenant_id, alertId, page, pageSize);
  }

  // ─── AI Narration Endpoints (impl 10) ─────────────────────────────────────
  //
  // Three endpoints, one method per narration type. Each is gated by:
  //   - `AuthGuard + PermissionGuard` from the class-level @UseGuards
  //   - `AiFlagGuard` registered globally via `APP_GUARD` in
  //     `AiFlagsModule`; activated by `@RequiresAiFlag('reports_narration')`
  //     and rejects 403 AI_DISABLED if the tenant has not enabled
  //     `reports_narration` in Settings → Reports.
  // The legacy `POST /v1/reports/ai/narrate` is kept as a deprecated alias
  // so any in-flight UI mid-migration keeps working; it routes to
  // `narrateReport` with the body's `report_type` becoming the path key.

  // POST /v1/reports/analytics/ai-summary — narrate the live KPI dashboard.
  @Post('analytics/ai-summary')
  @RequiresPermission('analytics.view')
  @RequiresAiFlag('reports_narration')
  async aiNarrateDashboard(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(dashboardNarrationRequestSchema))
    _body: DashboardNarrationRequestDto,
  ) {
    return this.aiNarrator.narrateDashboard(tenant.tenant_id, user.sub);
  }

  // POST /v1/reports/ai-narrator/report/:reportKey — narrate a domain report.
  @Post('ai-narrator/report/:reportKey')
  @RequiresPermission('analytics.view')
  @RequiresAiFlag('reports_narration')
  async aiNarrateReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('reportKey') reportKey: string,
    @Body(new ZodValidationPipe(reportNarrationRequestSchema))
    body: ReportNarrationRequestDto,
  ) {
    return this.aiNarrator.narrateReport(tenant.tenant_id, user.sub, reportKey, body.data);
  }

  // POST /v1/reports/ai-narrator/saved/:savedReportId — narrate a saved
  // custom-builder report by re-executing it through the query engine.
  @Post('ai-narrator/saved/:savedReportId')
  @RequiresPermission('analytics.view')
  @RequiresAiFlag('reports_narration')
  async aiNarrateSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('savedReportId', ParseUUIDPipe) savedReportId: string,
    @Body(new ZodValidationPipe(savedReportNarrationRequestSchema))
    _body: SavedReportNarrationRequestDto,
  ) {
    const permissions = await this.resolveBuilderPermissions(user);
    return this.aiNarrator.narrateSavedReport(
      tenant.tenant_id,
      user.sub,
      permissions,
      savedReportId,
    );
  }

  // POST /v1/reports/ai/narrate — DEPRECATED legacy alias. Routes to
  // narrateReport so callers carrying the old `{report_type, data}` body
  // shape during the Wave 4 UI cutover keep working. Removed in Wave 5.
  @Post('ai/narrate')
  @RequiresPermission('analytics.view')
  @RequiresAiFlag('reports_narration')
  async aiNarrate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiNarratorSchema)) body: z.infer<typeof aiNarratorSchema>,
  ) {
    return this.aiNarrator.narrateReport(tenant.tenant_id, user.sub, body.report_type, body.data);
  }

  @Post('ai/predict')
  @RequiresPermission('analytics.view')
  async aiPredict(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(aiPredictSchema)) body: z.infer<typeof aiPredictSchema>,
  ) {
    return this.aiPredictions.predictTrend(
      tenant.tenant_id,
      body.historical_data,
      body.report_type,
    );
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  @Post('export/excel')
  @RequiresPermission('analytics.view')
  async exportExcel(
    @Query(new ZodValidationPipe(reportExportQuerySchema))
    _query: z.infer<typeof reportExportQuerySchema>,
    @Body()
    body: { data: unknown[]; config: { title: string; school_name?: string; date_range?: string } },
  ) {
    return this.reportExport.generateFormattedExcel(body.data, body.config);
  }
}
