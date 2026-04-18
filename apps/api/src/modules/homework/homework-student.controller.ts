import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkStudentService } from './homework-student.service';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['outstanding', 'submitted', 'graded']).optional(),
});

const submitSchema = z.object({
  submission_text: z.string().max(10_000).optional(),
});

const addAttachmentSchema = z.object({
  attachment_type: z.enum(['file', 'link', 'video']),
  file_name: z.string().optional(),
  url: z.string().url().optional(),
  file_key: z.string().optional(),
  file_size_bytes: z.number().int().optional(),
  mime_type: z.string().optional(),
  display_order: z.number().int().min(0).default(0),
});

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/student/homework')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkStudentController {
  constructor(private readonly service: HomeworkStudentService) {}

  // GET /v1/student/homework
  @Get()
  @RequiresPermission('homework.submit.own')
  async listAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ) {
    return this.service.listAll(tenant.tenant_id, user.sub, query);
  }

  // GET /v1/student/homework/today — STATIC before :id
  @Get('today')
  @RequiresPermission('homework.submit.own')
  async listToday(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.service.listToday(tenant.tenant_id, user.sub);
  }

  // GET /v1/student/homework/this-week — STATIC before :id
  @Get('this-week')
  @RequiresPermission('homework.submit.own')
  async listThisWeek(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.service.listThisWeek(tenant.tenant_id, user.sub);
  }

  // GET /v1/student/homework/overdue — STATIC before :id
  @Get('overdue')
  @RequiresPermission('homework.submit.own')
  async listOverdue(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.service.listOverdue(tenant.tenant_id, user.sub);
  }

  // GET /v1/student/homework/:id
  @Get(':id')
  @RequiresPermission('homework.submit.own')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(tenant.tenant_id, user.sub, id);
  }

  // POST /v1/student/homework/:id/submit — create or update submission
  @Post(':id/submit')
  @RequiresPermission('homework.submit.own')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitSchema)) dto: z.infer<typeof submitSchema>,
  ) {
    return this.service.submit(tenant.tenant_id, user.sub, id, dto);
  }

  // POST /v1/student/homework/:id/attachments
  @Post(':id/attachments')
  @RequiresPermission('homework.submit.own')
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addAttachmentSchema))
    dto: z.infer<typeof addAttachmentSchema>,
  ) {
    return this.service.addAttachment(tenant.tenant_id, user.sub, id, dto);
  }

  // DELETE /v1/student/homework/:id/attachments/:attachmentId
  @Delete(':id/attachments/:attachmentId')
  @RequiresPermission('homework.submit.own')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    await this.service.removeAttachment(tenant.tenant_id, user.sub, id, attachmentId);
  }
}
