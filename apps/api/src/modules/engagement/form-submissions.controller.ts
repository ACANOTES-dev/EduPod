import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { paginationQuerySchema } from '@school/shared';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FormSubmissionsService } from './form-submissions.service';

// ─── Query schemas ────────────────────────────────────────────────────────────

const listFormSubmissionsQuerySchema = paginationQuerySchema.extend({
  form_template_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'submitted', 'acknowledged', 'expired', 'revoked']).optional(),
  student_id: z.string().uuid().optional(),
});

const completionStatsQuerySchema = z.object({
  form_template_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/engagement/form-submissions')
@UseGuards(AuthGuard, PermissionGuard)
export class FormSubmissionsController {
  constructor(private readonly formSubmissionsService: FormSubmissionsService) {}

  // GET /v1/engagement/form-submissions
  @Get()
  @RequiresPermission('engagement.form_templates.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listFormSubmissionsQuerySchema))
    query: z.infer<typeof listFormSubmissionsQuerySchema>,
  ) {
    return this.formSubmissionsService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/engagement/form-submissions/stats
  @Get('stats')
  @RequiresPermission('engagement.form_templates.view')
  async getCompletionStats(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(completionStatsQuerySchema))
    query: z.infer<typeof completionStatsQuerySchema>,
  ) {
    return this.formSubmissionsService.getCompletionStats(tenant.tenant_id, query);
  }

  // GET /v1/engagement/form-submissions/:id
  @Get(':id')
  @RequiresPermission('engagement.form_templates.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formSubmissionsService.findOne(tenant.tenant_id, id);
  }

  // POST /v1/engagement/form-submissions/:id/acknowledge
  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('engagement.form_templates.edit')
  async acknowledge(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formSubmissionsService.acknowledge(tenant.tenant_id, id, user.sub);
  }
}
