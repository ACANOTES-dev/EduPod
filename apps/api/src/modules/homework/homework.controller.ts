import {
  Body,
  Controller,
  Delete,
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

import { createHomeworkSchema, listHomeworkSchema, updateHomeworkSchema } from '@school/shared';
import type {
  CreateHomeworkDto,
  JwtPayload,
  ListHomeworkQuery,
  UpdateHomeworkDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkService } from './homework.service';

// ─── Inline schemas (controller-local, not shared) ────────────────────────────

const addAttachmentSchema = z.object({
  attachment_type: z.enum(['file', 'link', 'video']),
  file_name: z.string().optional(),
  url: z.string().url().optional(),
  file_key: z.string().optional(),
  file_size_bytes: z.number().int().optional(),
  mime_type: z.string().optional(),
  display_order: z.number().int().min(0).default(0),
});

const updateStatusSchema = z.object({
  status: z.enum(['published', 'archived']),
});

const copyHomeworkSchema = z.object({
  due_date: z.string().min(1),
  due_time: z.string().optional(),
});

const createRecurrenceRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'custom']),
  interval: z.number().int().min(1).default(1),
  days_of_week: z.array(z.number().int().min(0).max(6)).default([]),
  start_date: z.string().min(1),
  end_date: z.string().optional(),
});

const updateRecurrenceRuleSchema = createRecurrenceRuleSchema.partial();

const bulkCreateSchema = z.object({
  recurrence_rule_id: z.string().uuid(),
  template_homework_id: z.string().uuid().optional(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  homework_type: z.enum([
    'written',
    'reading',
    'research',
    'revision',
    'project_work',
    'online_activity',
  ]),
  description: z.string().optional(),
  max_points: z.number().int().min(0).max(100).optional(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
});

const classWeekQuerySchema = z.object({
  week_start: z.string().optional(),
});

const templateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

const myClassesQuerySchema = z.object({
  teacher_id: z.string().uuid().optional(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/homework')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  // POST /v1/homework
  @Post()
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createHomeworkSchema)) dto: CreateHomeworkDto,
  ) {
    return this.homeworkService.create(
      tenantContext.tenant_id,
      { user_id: user.sub, membership_id: user.membership_id },
      dto,
    );
  }

  // GET /v1/homework
  @Get()
  @RequiresPermission('homework.view')
  async findAll(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(listHomeworkSchema)) query: ListHomeworkQuery,
  ) {
    return this.homeworkService.list(tenantContext.tenant_id, query);
  }

  // GET /v1/homework/today — STATIC before :id
  @Get('today')
  @RequiresPermission('homework.view')
  async findToday(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.homeworkService.findToday(tenantContext.tenant_id, user.sub);
  }

  // GET /v1/homework/my-classes — STATIC before :id
  @Get('my-classes')
  @RequiresPermission('homework.view')
  async findMyClasses(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(myClassesQuerySchema))
    query: z.infer<typeof myClassesQuerySchema>,
  ) {
    const teacherUserId = query.teacher_id ?? user.sub;
    return this.homeworkService.findMyClasses(tenantContext.tenant_id, teacherUserId);
  }

  // GET /v1/homework/templates — STATIC before :id
  @Get('templates')
  @RequiresPermission('homework.view')
  async findTemplates(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(templateQuerySchema))
    query: z.infer<typeof templateQuerySchema>,
  ) {
    return this.homeworkService.findTemplates(tenantContext.tenant_id, query);
  }

  // GET /v1/homework/by-class/:classId
  @Get('by-class/:classId')
  @RequiresPermission('homework.view')
  async findByClass(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(listHomeworkSchema)) query: ListHomeworkQuery,
  ) {
    return this.homeworkService.findByClass(tenantContext.tenant_id, classId, query);
  }

  // GET /v1/homework/by-class/:classId/week
  @Get('by-class/:classId/week')
  @RequiresPermission('homework.view')
  async findByClassWeek(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(classWeekQuerySchema))
    query: z.infer<typeof classWeekQuerySchema>,
  ) {
    return this.homeworkService.findByClassWeek(tenantContext.tenant_id, classId, query.week_start);
  }

  // POST /v1/homework/recurrence-rules
  @Post('recurrence-rules')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.CREATED)
  async createRecurrenceRule(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createRecurrenceRuleSchema))
    dto: z.infer<typeof createRecurrenceRuleSchema>,
  ) {
    return this.homeworkService.createRecurrenceRule(tenantContext.tenant_id, dto);
  }

  // PATCH /v1/homework/recurrence-rules/:id
  @Patch('recurrence-rules/:id')
  @RequiresPermission('homework.manage')
  async updateRecurrenceRule(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecurrenceRuleSchema))
    dto: z.infer<typeof updateRecurrenceRuleSchema>,
  ) {
    return this.homeworkService.updateRecurrenceRule(tenantContext.tenant_id, id, dto);
  }

  // DELETE /v1/homework/recurrence-rules/:id
  @Delete('recurrence-rules/:id')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecurrenceRule(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.homeworkService.deleteRecurrenceRule(tenantContext.tenant_id, id);
  }

  // POST /v1/homework/bulk-create
  @Post('bulk-create')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkCreateSchema))
    dto: z.infer<typeof bulkCreateSchema>,
  ) {
    return this.homeworkService.bulkCreate(
      tenantContext.tenant_id,
      { user_id: user.sub, membership_id: user.membership_id },
      dto,
    );
  }

  // GET /v1/homework/:id
  @Get(':id')
  @RequiresPermission('homework.view')
  async findOne(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.homeworkService.findOne(tenantContext.tenant_id, id);
  }

  // PATCH /v1/homework/:id
  @Patch(':id')
  @RequiresPermission('homework.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHomeworkSchema)) dto: UpdateHomeworkDto,
  ) {
    return this.homeworkService.update(
      tenantContext.tenant_id,
      id,
      { user_id: user.sub, membership_id: user.membership_id },
      dto,
    );
  }

  // PATCH /v1/homework/:id/status
  @Patch(':id/status')
  @RequiresPermission('homework.manage')
  async updateStatus(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema))
    dto: z.infer<typeof updateStatusSchema>,
  ) {
    return this.homeworkService.updateStatus(tenantContext.tenant_id, id, dto);
  }

  // POST /v1/homework/:id/copy
  @Post(':id/copy')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.CREATED)
  async copy(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(copyHomeworkSchema))
    dto: z.infer<typeof copyHomeworkSchema>,
  ) {
    return this.homeworkService.copy(
      tenantContext.tenant_id,
      id,
      { user_id: user.sub, membership_id: user.membership_id },
      dto,
    );
  }

  // POST /v1/homework/:id/notify — fan out in-app notification to class parents
  @Post(':id/notify')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.OK)
  async notify(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.homeworkService.notify(tenantContext.tenant_id, id);
  }

  // GET /v1/homework/:id/notification-preview — parent count for confirm dialog
  @Get(':id/notification-preview')
  @RequiresPermission('homework.view')
  async notificationPreview(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.homeworkService.previewNotification(tenantContext.tenant_id, id);
  }

  // DELETE /v1/homework/:id
  @Delete(':id')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.homeworkService.remove(tenantContext.tenant_id, id);
  }

  // POST /v1/homework/:id/attachments
  @Post(':id/attachments')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addAttachmentSchema))
    dto: z.infer<typeof addAttachmentSchema>,
  ) {
    return this.homeworkService.addAttachment(tenantContext.tenant_id, id, dto);
  }

  // DELETE /v1/homework/:id/attachments/:attachmentId
  @Delete(':id/attachments/:attachmentId')
  @RequiresPermission('homework.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    await this.homeworkService.removeAttachment(tenantContext.tenant_id, id, attachmentId);
  }
}
