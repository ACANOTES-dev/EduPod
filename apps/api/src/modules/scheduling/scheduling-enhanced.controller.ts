import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';
import {
  absenceQuerySchema,
  addExamSlotSchema,
  assignSubstituteSchema,
  cancelAbsenceSchema,
  compareScenarioSchema,
  coverReportQuerySchema,
  createExamSessionSchema,
  createScenarioSchema,
  createSubscriptionTokenSchema,
  emergencyChangeSchema,
  examSessionQuerySchema,
  executeSwapSchema,
  reportAbsenceSchema,
  scenarioQuerySchema,
  schedulingAnalyticsQuerySchema,
  schedulingHistoricalComparisonQuerySchema,
  selfReportAbsenceSchema,
  substitutionRecordQuerySchema,
  timetableQuerySchema,
  updateExamSessionSchema,
  updateScenarioSchema,
  upsertRotationConfigSchema,
  validateSwapSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { AiSubstitutionService } from './ai-substitution.service';
import { CoverTrackingService } from './cover-tracking.service';
import { ExamSchedulingService } from './exam-scheduling.service';
import { PersonalTimetableService } from './personal-timetable.service';
import { RotationService } from './rotation.service';
import { ScenarioService } from './scenario.service';
import { ScheduleSwapService } from './schedule-swap.service';
import { SchedulingAnalyticsService } from './scheduling-analytics.service';
import { SubstitutionService } from './substitution.service';

const rotationWeekQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  date: z.string().date().optional(),
});

@Controller('v1/scheduling')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulingEnhancedController {
  constructor(
    private readonly substitutionService: SubstitutionService,
    private readonly aiSubstitutionService: AiSubstitutionService,
    private readonly coverTrackingService: CoverTrackingService,
    private readonly scheduleSwapService: ScheduleSwapService,
    private readonly personalTimetableService: PersonalTimetableService,
    private readonly rotationService: RotationService,
    private readonly examSchedulingService: ExamSchedulingService,
    private readonly scenarioService: ScenarioService,
    private readonly analyticsService: SchedulingAnalyticsService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Substitution ───────────────────────────────────────────────────────

  @Post('absences')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.CREATED)
  async reportAbsence(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(reportAbsenceSchema)) dto: z.infer<typeof reportAbsenceSchema>,
  ) {
    return this.substitutionService.reportAbsence(tenant.tenant_id, user.sub, dto);
  }

  // Teacher-initiated self-report. Derives staff_profile_id from the JWT.
  @Post('absences/self-report')
  @RequiresPermission('schedule.report_own_absence')
  @HttpCode(HttpStatus.CREATED)
  async selfReportAbsence(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(selfReportAbsenceSchema))
    dto: z.infer<typeof selfReportAbsenceSchema>,
  ) {
    return this.substitutionService.selfReportAbsence(tenant.tenant_id, user.sub, dto);
  }

  // Admin-tier cancel (any absence in the tenant).
  @Post('absences/:id/cancel')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.OK)
  async cancelAbsenceAsAdmin(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelAbsenceSchema))
    dto: z.infer<typeof cancelAbsenceSchema>,
  ) {
    return this.substitutionService.cancelAbsence(tenant.tenant_id, user.sub, id, dto);
  }

  // Teacher cancel — only their own absence.
  @Post('absences/:id/cancel-own')
  @RequiresPermission('schedule.report_own_absence')
  @HttpCode(HttpStatus.OK)
  async cancelOwnAbsence(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelAbsenceSchema))
    dto: z.infer<typeof cancelAbsenceSchema>,
  ) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenant.tenant_id, user.sub);
    if (!staff) {
      throw new NotFoundException({
        error: {
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: 'No staff profile linked to the current user',
        },
      });
    }
    return this.substitutionService.cancelAbsence(tenant.tenant_id, user.sub, id, dto, {
      requireOwnStaffProfileId: staff.id,
    });
  }

  @Get('absences')
  @RequiresPermission('schedule.manage_substitutions')
  async getAbsences(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(absenceQuerySchema)) query: z.infer<typeof absenceQuerySchema>,
  ) {
    return this.substitutionService.getAbsences(tenant.tenant_id, query);
  }

  @Delete('absences/:id')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.OK)
  async deleteAbsence(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.substitutionService.deleteAbsence(tenant.tenant_id, id);
  }

  @Get('absences/:absenceId/substitutes')
  @RequiresPermission('schedule.manage_substitutions')
  async findEligibleSubstitutes(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('absenceId', ParseUUIDPipe) absenceId: string,
    @Query(
      new ZodValidationPipe(z.object({ schedule_id: z.string().uuid(), date: z.string().date() })),
    )
    query: { schedule_id: string; date: string },
  ) {
    return this.substitutionService.findEligibleSubstitutes(
      tenant.tenant_id,
      query.schedule_id,
      query.date,
    );
  }

  @Get('absences/:absenceId/substitutes/ai')
  @RequiresPermission('schedule.manage_substitutions')
  async aiRankSubstitutes(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(
      new ZodValidationPipe(z.object({ schedule_id: z.string().uuid(), date: z.string().date() })),
    )
    query: { schedule_id: string; date: string },
  ) {
    return this.aiSubstitutionService.rankSubstitutes(
      tenant.tenant_id,
      query.schedule_id,
      query.date,
    );
  }

  @Post('substitutions')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.CREATED)
  async assignSubstitute(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(assignSubstituteSchema))
    dto: z.infer<typeof assignSubstituteSchema>,
  ) {
    return this.substitutionService.assignSubstitute(tenant.tenant_id, user.sub, dto);
  }

  @Get('substitutions')
  @RequiresPermission('schedule.manage_substitutions')
  async getSubstitutionRecords(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(substitutionRecordQuerySchema))
    query: z.infer<typeof substitutionRecordQuerySchema>,
  ) {
    return this.substitutionService.getSubstitutionRecords(tenant.tenant_id, query);
  }

  @Get('substitution-board')
  @RequiresPermission('schedule.manage_substitutions')
  async getTodayBoard(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.substitutionService.getTodayBoard(tenant.tenant_id);
  }

  // ─── Cover Reports ──────────────────────────────────────────────────────

  @Get('cover-reports')
  @RequiresPermission('schedule.view_reports')
  async getCoverReport(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(coverReportQuerySchema))
    query: z.infer<typeof coverReportQuerySchema>,
  ) {
    return this.coverTrackingService.getCoverReport(tenant.tenant_id, query);
  }

  @Get('cover-reports/fairness')
  @RequiresPermission('schedule.view_reports')
  async getCoverFairness(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(coverReportQuerySchema))
    query: z.infer<typeof coverReportQuerySchema>,
  ) {
    return this.coverTrackingService.getCoverFairness(tenant.tenant_id, query);
  }

  @Get('cover-reports/by-department')
  @RequiresPermission('schedule.view_reports')
  async getCoverByDepartment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(coverReportQuerySchema))
    query: z.infer<typeof coverReportQuerySchema>,
  ) {
    return this.coverTrackingService.getCoverByDepartment(tenant.tenant_id, query);
  }

  // ─── Schedule Swap ──────────────────────────────────────────────────────

  @Post('swaps/validate')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async validateSwap(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(validateSwapSchema)) dto: z.infer<typeof validateSwapSchema>,
  ) {
    return this.scheduleSwapService.validateSwap(tenant.tenant_id, dto);
  }

  @Post('swaps/execute')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async executeSwap(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(executeSwapSchema)) dto: z.infer<typeof executeSwapSchema>,
  ) {
    return this.scheduleSwapService.executeSwap(tenant.tenant_id, user.sub, dto);
  }

  @Post('emergency-change')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async emergencyChange(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(emergencyChangeSchema)) dto: z.infer<typeof emergencyChangeSchema>,
  ) {
    return this.scheduleSwapService.emergencyChange(tenant.tenant_id, user.sub, dto);
  }

  // ─── Personal Timetable ─────────────────────────────────────────────────

  @Get('timetable/teacher/:staffId')
  @RequiresPermission('schedule.view_reports')
  async getTeacherTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query(new ZodValidationPipe(timetableQuerySchema)) query: z.infer<typeof timetableQuerySchema>,
  ) {
    return this.personalTimetableService.getTeacherTimetable(tenant.tenant_id, staffId, query);
  }

  @Get('timetable/my')
  @RequiresPermission('schedule.view_own')
  async getMyTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(timetableQuerySchema)) query: z.infer<typeof timetableQuerySchema>,
  ) {
    // Resolve staff profile from user
    return this.personalTimetableService.getTeacherTimetableByUserId(
      tenant.tenant_id,
      user.sub,
      query,
    );
  }

  @Get('timetable/class/:classId')
  @RequiresPermission('schedule.view_reports')
  async getClassTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(timetableQuerySchema)) query: z.infer<typeof timetableQuerySchema>,
  ) {
    return this.personalTimetableService.getClassTimetable(tenant.tenant_id, classId, query);
  }

  @Post('calendar-tokens')
  @RequiresPermission('schedule.view_own')
  @HttpCode(HttpStatus.CREATED)
  async createCalendarToken(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSubscriptionTokenSchema))
    dto: z.infer<typeof createSubscriptionTokenSchema>,
  ) {
    return this.personalTimetableService.createSubscriptionToken(tenant.tenant_id, user.sub, dto);
  }

  @Get('calendar-tokens')
  @RequiresPermission('schedule.view_own')
  async listCalendarTokens(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.personalTimetableService.listSubscriptionTokens(tenant.tenant_id, user.sub);
  }

  @Delete('calendar-tokens/:tokenId')
  @RequiresPermission('schedule.view_own')
  @HttpCode(HttpStatus.OK)
  async revokeCalendarToken(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ) {
    return this.personalTimetableService.revokeSubscriptionToken(
      tenant.tenant_id,
      user.sub,
      tokenId,
    );
  }

  // ─── Rotation Config ────────────────────────────────────────────────────

  @Put('rotation')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async upsertRotation(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(upsertRotationConfigSchema))
    dto: z.infer<typeof upsertRotationConfigSchema>,
  ) {
    return this.rotationService.upsertRotationConfig(tenant.tenant_id, dto);
  }

  @Get('rotation')
  @RequiresPermission('schedule.view_reports')
  async getRotationConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(z.object({ academic_year_id: z.string().uuid() })))
    query: { academic_year_id: string },
  ) {
    return this.rotationService.getRotationConfig(tenant.tenant_id, query.academic_year_id);
  }

  @Delete('rotation')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async deleteRotationConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(z.object({ academic_year_id: z.string().uuid() })))
    query: { academic_year_id: string },
  ) {
    return this.rotationService.deleteRotationConfig(tenant.tenant_id, query.academic_year_id);
  }

  @Get('rotation/current-week')
  @RequiresPermission('schedule.view_reports')
  async getCurrentRotationWeek(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(rotationWeekQuerySchema))
    query: z.infer<typeof rotationWeekQuerySchema>,
  ) {
    return this.rotationService.getCurrentRotationWeek(
      tenant.tenant_id,
      query.academic_year_id,
      query.date,
    );
  }

  // ─── Exam Sessions ──────────────────────────────────────────────────────

  @Post('exam-sessions')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.CREATED)
  async createExamSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createExamSessionSchema))
    dto: z.infer<typeof createExamSessionSchema>,
  ) {
    return this.examSchedulingService.createExamSession(tenant.tenant_id, dto);
  }

  @Get('exam-sessions')
  @RequiresPermission('schedule.manage_exams')
  async listExamSessions(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(examSessionQuerySchema))
    query: z.infer<typeof examSessionQuerySchema>,
  ) {
    return this.examSchedulingService.listExamSessions(tenant.tenant_id, query);
  }

  @Get('exam-sessions/:id')
  @RequiresPermission('schedule.manage_exams')
  async getExamSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examSchedulingService.getExamSession(tenant.tenant_id, id);
  }

  @Put('exam-sessions/:id')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async updateExamSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateExamSessionSchema))
    dto: z.infer<typeof updateExamSessionSchema>,
  ) {
    return this.examSchedulingService.updateExamSession(tenant.tenant_id, id, dto);
  }

  @Delete('exam-sessions/:id')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async deleteExamSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.examSchedulingService.deleteExamSession(tenant.tenant_id, id);
  }

  @Post('exam-sessions/:id/slots')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.CREATED)
  async addExamSlot(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(addExamSlotSchema)) dto: z.infer<typeof addExamSlotSchema>,
  ) {
    return this.examSchedulingService.addExamSlot(tenant.tenant_id, sessionId, dto);
  }

  @Post('exam-sessions/:id/generate')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async generateExamSchedule(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examSchedulingService.generateExamSchedule(tenant.tenant_id, sessionId);
  }

  @Post('exam-sessions/:id/assign-invigilators')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async assignInvigilators(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examSchedulingService.assignInvigilators(tenant.tenant_id, sessionId);
  }

  @Post('exam-sessions/:id/publish')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async publishExamSchedule(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examSchedulingService.publishExamSchedule(tenant.tenant_id, sessionId);
  }

  // ─── Scenarios ──────────────────────────────────────────────────────────

  @Post('scenarios')
  @RequiresPermission('schedule.manage_scenarios')
  @HttpCode(HttpStatus.CREATED)
  async createScenario(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createScenarioSchema)) dto: z.infer<typeof createScenarioSchema>,
  ) {
    return this.scenarioService.createScenario(tenant.tenant_id, user.sub, dto);
  }

  @Get('scenarios')
  @RequiresPermission('schedule.manage_scenarios')
  async listScenarios(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(scenarioQuerySchema)) query: z.infer<typeof scenarioQuerySchema>,
  ) {
    return this.scenarioService.listScenarios(tenant.tenant_id, query);
  }

  @Get('scenarios/:id')
  @RequiresPermission('schedule.manage_scenarios')
  async getScenario(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scenarioService.getScenario(tenant.tenant_id, id);
  }

  @Put('scenarios/:id')
  @RequiresPermission('schedule.manage_scenarios')
  @HttpCode(HttpStatus.OK)
  async updateScenario(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateScenarioSchema)) dto: z.infer<typeof updateScenarioSchema>,
  ) {
    return this.scenarioService.updateScenario(tenant.tenant_id, id, dto);
  }

  @Delete('scenarios/:id')
  @RequiresPermission('schedule.manage_scenarios')
  @HttpCode(HttpStatus.OK)
  async deleteScenario(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scenarioService.deleteScenario(tenant.tenant_id, id);
  }

  @Post('scenarios/:id/solve')
  @RequiresPermission('schedule.manage_scenarios')
  @HttpCode(HttpStatus.OK)
  async runScenarioSolver(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scenarioService.runScenarioSolver(tenant.tenant_id, id);
  }

  @Post('scenarios/compare')
  @RequiresPermission('schedule.manage_scenarios')
  @HttpCode(HttpStatus.OK)
  async compareScenarios(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(compareScenarioSchema)) dto: z.infer<typeof compareScenarioSchema>,
  ) {
    return this.scenarioService.compareScenarios(tenant.tenant_id, dto);
  }

  // ─── Analytics ──────────────────────────────────────────────────────────

  @Get('analytics/efficiency')
  @RequiresPermission('schedule.view_reports')
  async getEfficiencyDashboard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(schedulingAnalyticsQuerySchema))
    query: z.infer<typeof schedulingAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getEfficiencyDashboard(tenant.tenant_id, query);
  }

  @Get('analytics/workload')
  @RequiresPermission('schedule.view_reports')
  async getWorkloadHeatmap(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(schedulingAnalyticsQuerySchema))
    query: z.infer<typeof schedulingAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getWorkloadHeatmap(tenant.tenant_id, query);
  }

  @Get('analytics/rooms')
  @RequiresPermission('schedule.view_reports')
  async getRoomUtilization(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(schedulingAnalyticsQuerySchema))
    query: z.infer<typeof schedulingAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getRoomUtilization(tenant.tenant_id, query);
  }

  @Get('analytics/historical')
  @RequiresPermission('schedule.view_reports')
  async getHistoricalComparison(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(schedulingHistoricalComparisonQuerySchema))
    query: z.infer<typeof schedulingHistoricalComparisonQuerySchema>,
  ) {
    return this.analyticsService.getHistoricalComparison(tenant.tenant_id, query);
  }
}
