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
import { createDiaryNoteSchema, createParentNoteSchema } from '@school/shared';
import type { CreateDiaryNoteDto, CreateParentNoteDto, JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkDiaryService } from './homework-diary.service';

// ─── Query schemas ────────────────────────────────────────────────────────────

const diaryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const updateDiaryNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/diary')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkDiaryController {
  constructor(private readonly homeworkDiaryService: HomeworkDiaryService) {}

  // ─── Static routes (must precede dynamic :studentId) ────────────────────

  // PATCH /v1/diary/parent-notes/:id/acknowledge
  @Patch('parent-notes/:id/acknowledge')
  @RequiresPermission('homework.view_diary')
  async acknowledgeNote(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.homeworkDiaryService.acknowledgeNote(tenantContext.tenant_id, id, user.sub);
  }

  // ─── Dynamic :studentId routes ──────────────────────────────────────────

  // GET /v1/diary/:studentId
  @Get(':studentId')
  @RequiresPermission('homework.view_diary')
  async listNotes(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(diaryQuerySchema))
    query: z.infer<typeof diaryQuerySchema>,
  ) {
    return this.homeworkDiaryService.listNotes(tenantContext.tenant_id, studentId, query);
  }

  // POST /v1/diary/:studentId
  @Post(':studentId')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('homework.write_diary')
  async createNote(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(createDiaryNoteSchema)) dto: CreateDiaryNoteDto,
  ) {
    return this.homeworkDiaryService.createNote(tenantContext.tenant_id, studentId, dto);
  }

  // PATCH /v1/diary/:studentId/:noteDate
  @Patch(':studentId/:noteDate')
  @RequiresPermission('homework.write_diary')
  async updateNote(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('noteDate') noteDate: string,
    @Body(new ZodValidationPipe(updateDiaryNoteSchema))
    dto: z.infer<typeof updateDiaryNoteSchema>,
  ) {
    return this.homeworkDiaryService.updateNote(
      tenantContext.tenant_id,
      studentId,
      noteDate,
      dto.content,
    );
  }

  // GET /v1/diary/:studentId/parent-notes
  @Get(':studentId/parent-notes')
  @RequiresPermission('homework.view_diary')
  async listParentNotes(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(diaryQuerySchema))
    query: z.infer<typeof diaryQuerySchema>,
  ) {
    return this.homeworkDiaryService.listParentNotes(tenantContext.tenant_id, studentId, query);
  }

  // POST /v1/diary/:studentId/parent-notes
  @Post(':studentId/parent-notes')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('homework.write_diary', 'parent.homework')
  async createParentNote(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(createParentNoteSchema)) dto: CreateParentNoteDto,
  ) {
    return this.homeworkDiaryService.createParentNote(
      tenantContext.tenant_id,
      studentId,
      user.sub,
      dto,
    );
  }
}
