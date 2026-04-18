import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { bulkMarkCompletionSchema, markCompletionSchema } from '@school/shared';
import type { BulkMarkCompletionDto, JwtPayload, MarkCompletionDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkCompletionsService } from './homework-completions.service';

// ─── Inline schemas ───────────────────────────────────────────────────────────

const gradeSubmissionSchema = z.object({
  points_awarded: z.number().int().min(0).max(100).nullable().optional(),
  teacher_feedback: z.string().max(5000).nullable().optional(),
});

const returnSubmissionSchema = z.object({
  teacher_feedback: z.string().min(1).max(5000),
});

@Controller('v1/homework')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkCompletionsController {
  constructor(private readonly completionsService: HomeworkCompletionsService) {}

  // GET /v1/homework/:id/completions
  @Get(':id/completions')
  @RequiresPermission('homework.view')
  async listCompletions(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) homeworkId: string,
  ) {
    return this.completionsService.listCompletions(tenant.tenant_id, homeworkId);
  }

  // POST /v1/homework/:id/completions
  @Post(':id/completions')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.OK)
  async studentSelfReport(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) homeworkId: string,
    @Body(new ZodValidationPipe(markCompletionSchema)) dto: MarkCompletionDto,
  ) {
    return this.completionsService.studentSelfReport(tenant.tenant_id, homeworkId, user.sub, dto);
  }

  // POST /v1/homework/:id/completions/bulk — STATIC route before :studentId
  @Post(':id/completions/bulk')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.OK)
  async bulkMark(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) homeworkId: string,
    @Body(new ZodValidationPipe(bulkMarkCompletionSchema))
    dto: BulkMarkCompletionDto,
  ) {
    return this.completionsService.bulkMark(tenant.tenant_id, homeworkId, user.sub, dto);
  }

  // PATCH /v1/homework/:id/completions/:studentId
  @Patch(':id/completions/:studentId')
  @RequiresPermission('homework.manage')
  async teacherUpdate(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) homeworkId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(markCompletionSchema)) dto: MarkCompletionDto,
  ) {
    return this.completionsService.teacherUpdate(
      tenant.tenant_id,
      homeworkId,
      studentId,
      user.sub,
      dto,
    );
  }

  // GET /v1/homework/:id/completion-rate
  @Get(':id/completion-rate')
  @RequiresPermission('homework.view')
  async getCompletionRate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) homeworkId: string,
  ) {
    return this.completionsService.getCompletionRate(tenant.tenant_id, homeworkId);
  }

  // GET /v1/homework/:id/submissions
  @Get(':id/submissions')
  @RequiresPermission('homework.view')
  async listSubmissions(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) homeworkId: string,
  ) {
    return this.completionsService.listSubmissions(tenant.tenant_id, homeworkId);
  }

  // POST /v1/homework/:id/submissions/:submissionId/grade
  @Post(':id/submissions/:submissionId/grade')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.OK)
  async gradeSubmission(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) homeworkId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body(new ZodValidationPipe(gradeSubmissionSchema))
    dto: z.infer<typeof gradeSubmissionSchema>,
  ) {
    return this.completionsService.gradeSubmission(
      tenant.tenant_id,
      homeworkId,
      submissionId,
      user.sub,
      dto,
    );
  }

  // POST /v1/homework/:id/submissions/:submissionId/return — return for revision
  @Post(':id/submissions/:submissionId/return')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.OK)
  async returnSubmission(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) homeworkId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body(new ZodValidationPipe(returnSubmissionSchema))
    dto: z.infer<typeof returnSubmissionSchema>,
  ) {
    return this.completionsService.returnSubmission(
      tenant.tenant_id,
      homeworkId,
      submissionId,
      user.sub,
      dto,
    );
  }
}
