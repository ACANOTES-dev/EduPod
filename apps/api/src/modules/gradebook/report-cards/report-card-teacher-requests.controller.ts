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

import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import {
  approveTeacherRequestSchema,
  listTeacherRequestsQuerySchema,
  rejectTeacherRequestSchema,
  submitTeacherRequestSchema,
} from './dto/teacher-request.dto';
import type {
  ApproveTeacherRequestDto,
  ListTeacherRequestsQuery,
  RejectTeacherRequestDto,
  SubmitTeacherRequestDto,
} from './dto/teacher-request.dto';
import { ReportCardTeacherRequestsService } from './report-card-teacher-requests.service';
import type { TeacherRequestActor } from './report-card-teacher-requests.service';

const ADMIN_PERMISSION = 'report_cards.manage';

@Controller('v1/report-card-teacher-requests')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardTeacherRequestsController {
  constructor(
    private readonly teacherRequestsService: ReportCardTeacherRequestsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Actor helpers ────────────────────────────────────────────────────────

  private async resolveActor(user: JwtPayload): Promise<TeacherRequestActor> {
    const isAdmin = await this.isAdmin(user);
    return { userId: user.sub, isAdmin };
  }

  private async isAdmin(user: JwtPayload): Promise<boolean> {
    if (!user.membership_id) return false;
    const perms = await this.permissionCacheService.getPermissions(user.membership_id);
    return perms.includes(ADMIN_PERMISSION);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  // GET /v1/report-card-teacher-requests
  @Get()
  @RequiresPermission('report_cards.comment')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listTeacherRequestsQuerySchema))
    query: ListTeacherRequestsQuery,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.list(tenant.tenant_id, actor, query);
  }

  // GET /v1/report-card-teacher-requests/pending
  // Static path registered BEFORE the dynamic :id route so Nest matches it first.
  @Get('pending')
  @RequiresPermission('report_cards.manage')
  async listPending(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.teacherRequestsService.listPendingForReviewer(tenant.tenant_id);
  }

  // GET /v1/report-card-teacher-requests/:id
  @Get(':id')
  @RequiresPermission('report_cards.comment')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.findById(tenant.tenant_id, actor, id);
  }

  // ─── Teacher write ───────────────────────────────────────────────────────

  // POST /v1/report-card-teacher-requests
  @Post()
  @RequiresPermission('report_cards.comment')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitTeacherRequestSchema))
    dto: SubmitTeacherRequestDto,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.submit(tenant.tenant_id, actor, dto);
  }

  // PATCH /v1/report-card-teacher-requests/:id/cancel
  @Patch(':id/cancel')
  @RequiresPermission('report_cards.comment')
  async cancel(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.cancel(tenant.tenant_id, actor, id);
  }

  // ─── Admin write ─────────────────────────────────────────────────────────

  // PATCH /v1/report-card-teacher-requests/:id/approve
  @Patch(':id/approve')
  @RequiresPermission('report_cards.manage')
  async approve(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveTeacherRequestSchema))
    dto: ApproveTeacherRequestDto,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.approve(tenant.tenant_id, actor, id, dto);
  }

  // PATCH /v1/report-card-teacher-requests/:id/reject
  @Patch(':id/reject')
  @RequiresPermission('report_cards.manage')
  async reject(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectTeacherRequestSchema))
    dto: RejectTeacherRequestDto,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.reject(tenant.tenant_id, actor, id, dto);
  }

  // PATCH /v1/report-card-teacher-requests/:id/complete
  @Patch(':id/complete')
  @RequiresPermission('report_cards.manage')
  async complete(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.resolveActor(user);
    return this.teacherRequestsService.markCompleted(tenant.tenant_id, actor, id);
  }
}
