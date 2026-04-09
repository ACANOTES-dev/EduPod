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
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import { createSubjectCommentSchema } from './dto/subject-comment.dto';
import type { CreateSubjectCommentDto } from './dto/subject-comment.dto';
import { ReportCardAiDraftService } from './report-card-ai-draft.service';
import { ReportCardSubjectCommentsService } from './report-card-subject-comments.service';

// ─── Query Schemas ───────────────────────────────────────────────────────────

const listSubjectCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  author_user_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  finalised: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const bulkFinaliseSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});

// Single-student AI draft request. class_id is required because the backend
// needs it to verify the teacher-class assignment and to scope grade snapshots.
const aiDraftRequestSchema = z.object({
  student_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});

const ADMIN_PERMISSION = 'report_cards.manage';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1/report-card-subject-comments')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardSubjectCommentsController {
  constructor(
    private readonly commentsService: ReportCardSubjectCommentsService,
    private readonly aiDraftService: ReportCardAiDraftService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Admin check helper ────────────────────────────────────────────────

  private async isAdmin(user: JwtPayload): Promise<boolean> {
    if (!user.membership_id) return false;
    const perms = await this.permissionCacheService.getPermissions(user.membership_id);
    return perms.includes(ADMIN_PERMISSION);
  }

  // GET /v1/report-card-subject-comments
  @Get()
  @RequiresPermission('report_cards.view')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listSubjectCommentsQuerySchema))
    query: z.infer<typeof listSubjectCommentsQuerySchema>,
  ) {
    return this.commentsService.list(tenant.tenant_id, query);
  }

  // GET /v1/report-card-subject-comments/count
  @Get('count')
  @RequiresPermission('report_cards.view')
  async count(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query('class_id', ParseUUIDPipe) classId: string,
    @Query('subject_id', ParseUUIDPipe) subjectId: string,
    @Query('academic_period_id', ParseUUIDPipe) academicPeriodId: string,
  ) {
    return this.commentsService.countByClassSubjectPeriod(tenant.tenant_id, {
      classId,
      subjectId,
      academicPeriodId,
    });
  }

  // GET /v1/report-card-subject-comments/:id
  @Get(':id')
  @RequiresPermission('report_cards.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commentsService.findById(tenant.tenant_id, id);
  }

  // POST /v1/report-card-subject-comments — upsert
  @Post()
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.OK)
  async upsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSubjectCommentSchema))
    dto: CreateSubjectCommentDto,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.commentsService.upsert(tenant.tenant_id, { userId: user.sub, isAdmin }, dto);
  }

  // PATCH /v1/report-card-subject-comments/:id/finalise
  @Patch(':id/finalise')
  @RequiresPermission('report_cards.comment')
  async finalise(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.commentsService.finalise(tenant.tenant_id, { userId: user.sub, isAdmin }, id);
  }

  // PATCH /v1/report-card-subject-comments/:id/unfinalise
  @Patch(':id/unfinalise')
  @RequiresPermission('report_cards.comment')
  async unfinalise(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.commentsService.unfinalise(tenant.tenant_id, { userId: user.sub, isAdmin }, id);
  }

  // POST /v1/report-card-subject-comments/ai-draft — single-student AI draft
  @Post('ai-draft')
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.OK)
  async aiDraft(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiDraftRequestSchema))
    dto: z.infer<typeof aiDraftRequestSchema>,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.aiDraftService.draftSubjectComment(
      tenant.tenant_id,
      { userId: user.sub, isAdmin },
      {
        studentId: dto.student_id,
        subjectId: dto.subject_id,
        classId: dto.class_id,
        academicPeriodId: dto.academic_period_id,
      },
    );
  }

  // POST /v1/report-card-subject-comments/bulk-finalise
  @Post('bulk-finalise')
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.OK)
  async bulkFinalise(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkFinaliseSchema))
    dto: z.infer<typeof bulkFinaliseSchema>,
  ) {
    const isAdmin = await this.isAdmin(user);
    const count = await this.commentsService.bulkFinalise(
      tenant.tenant_id,
      { userId: user.sub, isAdmin },
      {
        classId: dto.class_id,
        subjectId: dto.subject_id,
        academicPeriodId: dto.academic_period_id,
      },
    );
    return { count };
  }
}
