import { randomUUID } from 'crypto';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { RedisService } from '../../redis/redis.service';

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
    private readonly redisService: RedisService,
  ) {}

  // TTL for async AI draft job status entries in Redis (seconds). Long
  // enough for the frontend to poll a slow draft to completion (LLM p99 is
  // ~30s) but short enough that stale entries don't pile up.
  private readonly AI_DRAFT_JOB_TTL_SECONDS = 600;

  private aiDraftJobKey(tenantId: string, jobId: string): string {
    return `ai-draft-job:${tenantId}:${jobId}`;
  }

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
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSubjectCommentsQuerySchema))
    query: z.infer<typeof listSubjectCommentsQuerySchema>,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.commentsService.list(tenant.tenant_id, query, {
      userId: user.sub,
      isAdmin,
    });
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

  // POST /v1/report-card-subject-comments/ai-draft-async
  // Enqueues the AI draft and returns 202 immediately with a job id the
  // client polls via GET /ai-draft-jobs/:jobId. Keeps the HTTP connection
  // off the critical path of a 5-30s LLM call. Bug RC-C014.
  //
  // Scaffolding note: execution runs in-process (not on the dedicated
  // worker) because the AI draft service depends on request-scoped
  // primitives (tenant context, RLS) that aren't yet wired into the
  // worker process. A follow-up should move execution to a BullMQ
  // `ai-comment-draft` queue with a worker processor. Until then, the
  // in-process path still yields a non-blocking HTTP response.
  @Post('ai-draft-async')
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.ACCEPTED)
  async aiDraftAsync(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiDraftRequestSchema))
    dto: z.infer<typeof aiDraftRequestSchema>,
  ) {
    const isAdmin = await this.isAdmin(user);
    const jobId = randomUUID();
    const key = this.aiDraftJobKey(tenant.tenant_id, jobId);
    const redis = this.redisService.getClient();

    await redis.set(
      key,
      JSON.stringify({
        status: 'pending',
        requested_by: user.sub,
        requested_at: new Date().toISOString(),
      }),
      'EX',
      this.AI_DRAFT_JOB_TTL_SECONDS,
    );

    // Fire-and-forget. Errors are captured into the Redis job state.
    void this.aiDraftService
      .draftSubjectComment(
        tenant.tenant_id,
        { userId: user.sub, isAdmin },
        {
          studentId: dto.student_id,
          subjectId: dto.subject_id,
          classId: dto.class_id,
          academicPeriodId: dto.academic_period_id,
        },
      )
      .then((result) =>
        redis.set(
          key,
          JSON.stringify({
            status: 'completed',
            requested_by: user.sub,
            completed_at: new Date().toISOString(),
            result,
          }),
          'EX',
          this.AI_DRAFT_JOB_TTL_SECONDS,
        ),
      )
      .catch((err: unknown) => {
        const code =
          (err as { code?: string; response?: { code?: string } })?.code ??
          (err as { response?: { code?: string } })?.response?.code ??
          'AI_DRAFT_FAILED';
        const message =
          err instanceof Error ? err.message : String(err ?? 'Unknown AI draft failure');
        return redis.set(
          key,
          JSON.stringify({
            status: 'failed',
            requested_by: user.sub,
            completed_at: new Date().toISOString(),
            error: { code, message },
          }),
          'EX',
          this.AI_DRAFT_JOB_TTL_SECONDS,
        );
      });

    return { job_id: jobId, status: 'pending' as const };
  }

  // GET /v1/report-card-subject-comments/ai-draft-jobs/:jobId
  @Get('ai-draft-jobs/:jobId')
  @RequiresPermission('report_cards.comment')
  async aiDraftJobStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const redis = this.redisService.getClient();
    const raw = await redis.get(this.aiDraftJobKey(tenant.tenant_id, jobId));
    if (!raw) {
      throw new NotFoundException({
        code: 'AI_DRAFT_JOB_NOT_FOUND',
        message: `AI draft job "${jobId}" not found or expired`,
      });
    }
    const parsed = JSON.parse(raw) as {
      status: 'pending' | 'completed' | 'failed';
      requested_by: string;
      requested_at?: string;
      completed_at?: string;
      result?: unknown;
      error?: { code: string; message: string };
    };
    // Only the teacher who initiated the job can read its result (prevents
    // cross-teacher snooping on drafts-in-progress).
    if (parsed.requested_by !== user.sub) {
      throw new NotFoundException({
        code: 'AI_DRAFT_JOB_NOT_FOUND',
        message: `AI draft job "${jobId}" not found or expired`,
      });
    }
    return parsed;
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
