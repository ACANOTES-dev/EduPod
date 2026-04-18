import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';
import {
  bulkUpsertExamSubjectConfigsSchema,
  publishExamSessionSchema,
  setInvigilatorPoolSchema,
  triggerExamSolverSchema,
  upsertExamSessionConfigSchema,
  upsertExamSubjectConfigSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ExamInvigilatorPoolService } from './exam-invigilator-pool.service';
import { ExamPublishService } from './exam-publish.service';
import { ExamSchedulingService } from './exam-scheduling.service';
import { ExamSessionConfigService } from './exam-session-config.service';
import { ExamSolverOrchestrationService } from './exam-solver-orchestration.service';
import { ExamSubjectConfigService } from './exam-subject-config.service';

// v2 exam scheduling routes — the new dashboard-backed flow.
// These live alongside the legacy exam routes on SchedulingEnhancedController;
// legacy routes remain until the old /scheduling/exams UI is removed.

@Controller('v1/scheduling/exam-sessions')
@UseGuards(AuthGuard, PermissionGuard)
export class ExamSchedulingV2Controller {
  constructor(
    private readonly sessionConfigService: ExamSessionConfigService,
    private readonly subjectConfigService: ExamSubjectConfigService,
    private readonly invigilatorPoolService: ExamInvigilatorPoolService,
    private readonly solverService: ExamSolverOrchestrationService,
    private readonly publishService: ExamPublishService,
    private readonly examSchedulingService: ExamSchedulingService,
  ) {}

  // ─── Session window config ────────────────────────────────────────────────

  // GET /v1/scheduling/exam-sessions/:id/config
  @Get(':id/config')
  @RequiresPermission('schedule.manage_exams')
  async getSessionConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessionConfigService.getConfig(tenant.tenant_id, sessionId);
  }

  // PUT /v1/scheduling/exam-sessions/:id/config
  @Put(':id/config')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async upsertSessionConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(upsertExamSessionConfigSchema))
    dto: z.infer<typeof upsertExamSessionConfigSchema>,
  ) {
    return this.sessionConfigService.upsertConfig(tenant.tenant_id, sessionId, dto);
  }

  // ─── Subject matrix ───────────────────────────────────────────────────────

  // GET /v1/scheduling/exam-sessions/:id/subject-configs
  @Get(':id/subject-configs')
  @RequiresPermission('schedule.manage_exams')
  async listSubjectConfigs(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    const data = await this.subjectConfigService.listConfigs(tenant.tenant_id, sessionId);
    return { data };
  }

  // PUT /v1/scheduling/exam-sessions/:id/subject-configs
  @Put(':id/subject-configs')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async upsertSubjectConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(upsertExamSubjectConfigSchema))
    dto: z.infer<typeof upsertExamSubjectConfigSchema>,
  ) {
    return this.subjectConfigService.upsertConfig(tenant.tenant_id, sessionId, dto);
  }

  // POST /v1/scheduling/exam-sessions/:id/subject-configs/bulk
  @Post(':id/subject-configs/bulk')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async bulkUpsertSubjectConfigs(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(bulkUpsertExamSubjectConfigsSchema))
    dto: z.infer<typeof bulkUpsertExamSubjectConfigsSchema>,
  ) {
    return this.subjectConfigService.bulkUpsert(tenant.tenant_id, sessionId, dto);
  }

  // ─── Invigilator pool ─────────────────────────────────────────────────────

  // GET /v1/scheduling/exam-sessions/:id/invigilator-pool
  @Get(':id/invigilator-pool')
  @RequiresPermission('schedule.manage_exams')
  async getInvigilatorPool(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    const data = await this.invigilatorPoolService.getPool(tenant.tenant_id, sessionId);
    return { data };
  }

  // PUT /v1/scheduling/exam-sessions/:id/invigilator-pool
  @Put(':id/invigilator-pool')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async setInvigilatorPool(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(setInvigilatorPoolSchema))
    dto: z.infer<typeof setInvigilatorPoolSchema>,
  ) {
    return this.invigilatorPoolService.setPool(tenant.tenant_id, sessionId, dto);
  }

  // ─── Solve (async — enqueue + poll) ───────────────────────────────────────

  // POST /v1/scheduling/exam-sessions/:id/solve — enqueue an exam solve job.
  // Returns { solve_job_id, status } immediately; client then polls
  // /solve-jobs/:jobId/progress until terminal.
  @Post(':id/solve')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.ACCEPTED)
  async solve(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(triggerExamSolverSchema))
    dto: z.infer<typeof triggerExamSolverSchema>,
  ) {
    return this.solverService.enqueueSolve(tenant.tenant_id, sessionId, dto, user.sub);
  }

  // GET /v1/scheduling/exam-sessions/:id/solve-jobs/:jobId/progress
  @Get(':id/solve-jobs/:jobId/progress')
  @RequiresPermission('schedule.manage_exams')
  async getSolveProgress(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) _sessionId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.solverService.getSolveProgress(tenant.tenant_id, jobId);
  }

  // POST /v1/scheduling/exam-sessions/:id/solve-jobs/:jobId/cancel
  @Post(':id/solve-jobs/:jobId/cancel')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async cancelSolve(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) _sessionId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.solverService.cancelSolve(tenant.tenant_id, jobId);
  }

  // ─── Detailed slot listing (for review UI) ────────────────────────────────

  // GET /v1/scheduling/exam-sessions/:id/slots-detailed
  @Get(':id/slots-detailed')
  @RequiresPermission('schedule.manage_exams')
  async listSlotsDetailed(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.examSchedulingService.listExamSlotsDetailed(tenant.tenant_id, sessionId);
  }

  // ─── Publish (v2 — replaces legacy publish) ───────────────────────────────

  // POST /v1/scheduling/exam-sessions/:id/publish-v2
  @Post(':id/publish-v2')
  @RequiresPermission('schedule.manage_exams')
  @HttpCode(HttpStatus.OK)
  async publishV2(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(publishExamSessionSchema))
    _dto: z.infer<typeof publishExamSessionSchema>,
  ) {
    return this.publishService.publishSession(tenant.tenant_id, sessionId, user.sub);
  }
}
