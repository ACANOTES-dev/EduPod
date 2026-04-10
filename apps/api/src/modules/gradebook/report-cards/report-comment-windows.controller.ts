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

import { createCommentWindowSchema, updateCommentWindowSchema } from './dto/comment-window.dto';
import type { CreateCommentWindowDto, UpdateCommentWindowDto } from './dto/comment-window.dto';
import { ReportCommentWindowsService } from './report-comment-windows.service';

const ADMIN_PERMISSION = 'report_cards.manage';

// ─── Query Schemas ───────────────────────────────────────────────────────────

const listCommentWindowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['scheduled', 'open', 'closed']).optional(),
  academic_period_id: z.string().uuid().optional(),
});

const extendCommentWindowSchema = z.object({
  closes_at: z.string().datetime(),
});

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1/report-comment-windows')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCommentWindowsController {
  constructor(
    private readonly windowsService: ReportCommentWindowsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  private async isAdmin(user: JwtPayload): Promise<boolean> {
    if (!user.membership_id) return false;
    const perms = await this.permissionCacheService.getPermissions(user.membership_id);
    return perms.includes(ADMIN_PERMISSION);
  }

  // GET /v1/report-comment-windows
  @Get()
  @RequiresPermission('report_cards.view')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listCommentWindowsQuerySchema))
    query: z.infer<typeof listCommentWindowsQuerySchema>,
  ) {
    return this.windowsService.list(tenant.tenant_id, query);
  }

  // GET /v1/report-comment-windows/active
  // Static path before the dynamic :id route so Nest matches it first.
  @Get('active')
  @RequiresPermission('report_cards.view')
  async active(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.windowsService.findActive(tenant.tenant_id);
  }

  // GET /v1/report-comment-windows/landing
  // Round-2 QA / B6: returns the class IDs the actor is allowed to see on
  // the report-comments landing page, partitioned into "overall" (homeroom
  // assignments on the open window) and "subject" (class_staff
  // assignments). Admins get empty arrays as a sentinel for "no filter —
  // show everything".
  @Get('landing')
  @RequiresPermission('report_cards.view')
  async landing(@CurrentTenant() tenant: { tenant_id: string }, @CurrentUser() user: JwtPayload) {
    const isAdmin = await this.isAdmin(user);
    return this.windowsService.getLandingScopeForActor(tenant.tenant_id, {
      userId: user.sub,
      isAdmin,
    });
  }

  // GET /v1/report-comment-windows/:id
  @Get(':id')
  @RequiresPermission('report_cards.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.windowsService.findById(tenant.tenant_id, id);
  }

  // POST /v1/report-comment-windows — open a new window
  @Post()
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.CREATED)
  async open(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCommentWindowSchema))
    dto: CreateCommentWindowDto,
  ) {
    return this.windowsService.open(tenant.tenant_id, user.sub, dto);
  }

  // PATCH /v1/report-comment-windows/:id/close
  @Patch(':id/close')
  @RequiresPermission('report_cards.manage')
  async closeNow(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.windowsService.closeNow(tenant.tenant_id, user.sub, id);
  }

  // PATCH /v1/report-comment-windows/:id/extend
  @Patch(':id/extend')
  @RequiresPermission('report_cards.manage')
  async extend(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(extendCommentWindowSchema))
    dto: z.infer<typeof extendCommentWindowSchema>,
  ) {
    return this.windowsService.extend(tenant.tenant_id, user.sub, id, new Date(dto.closes_at));
  }

  // PATCH /v1/report-comment-windows/:id/reopen
  @Patch(':id/reopen')
  @RequiresPermission('report_cards.manage')
  async reopen(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.windowsService.reopen(tenant.tenant_id, user.sub, id);
  }

  // PATCH /v1/report-comment-windows/:id — update instructions / schedule
  @Patch(':id')
  @RequiresPermission('report_cards.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCommentWindowSchema))
    dto: UpdateCommentWindowDto,
  ) {
    return this.windowsService.updateInstructions(tenant.tenant_id, user.sub, id, dto);
  }
}
