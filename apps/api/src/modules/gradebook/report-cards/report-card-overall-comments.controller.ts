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

import { createOverallCommentSchema } from './dto/overall-comment.dto';
import type { CreateOverallCommentDto } from './dto/overall-comment.dto';
import { ReportCardOverallCommentsService } from './report-card-overall-comments.service';

// ─── Query Schemas ───────────────────────────────────────────────────────────

const listOverallCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  class_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  author_user_id: z.string().uuid().optional(),
  finalised: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const ADMIN_PERMISSION = 'report_cards.manage';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1/report-card-overall-comments')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardOverallCommentsController {
  constructor(
    private readonly commentsService: ReportCardOverallCommentsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  private async isAdmin(user: JwtPayload): Promise<boolean> {
    if (!user.membership_id) return false;
    const perms = await this.permissionCacheService.getPermissions(user.membership_id);
    return perms.includes(ADMIN_PERMISSION);
  }

  // GET /v1/report-card-overall-comments
  @Get()
  @RequiresPermission('report_cards.view')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listOverallCommentsQuerySchema))
    query: z.infer<typeof listOverallCommentsQuerySchema>,
  ) {
    return this.commentsService.list(tenant.tenant_id, query);
  }

  // GET /v1/report-card-overall-comments/:id
  @Get(':id')
  @RequiresPermission('report_cards.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commentsService.findById(tenant.tenant_id, id);
  }

  // POST /v1/report-card-overall-comments — upsert
  @Post()
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.OK)
  async upsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createOverallCommentSchema))
    dto: CreateOverallCommentDto,
  ) {
    const isAdmin = await this.isAdmin(user);
    return this.commentsService.upsert(tenant.tenant_id, { userId: user.sub, isAdmin }, dto);
  }

  // PATCH /v1/report-card-overall-comments/:id/finalise
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

  // PATCH /v1/report-card-overall-comments/:id/unfinalise
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
}
