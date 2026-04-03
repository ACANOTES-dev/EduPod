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

import { paginationQuerySchema, type JwtPayload } from '@school/shared';
import {
  createEngagementFormTemplateSchema,
  distributeFormSchema,
  updateEngagementFormTemplateSchema,
  type CreateEngagementFormTemplateDto,
  type DistributeFormDto,
  type UpdateEngagementFormTemplateDto,
} from '@school/shared/engagement';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FormTemplatesService } from './form-templates.service';

// ─── Query schemas ────────────────────────────────────────────────────────────

const listFormTemplatesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  form_type: z.enum(['consent_form', 'risk_assessment', 'survey', 'policy_signoff']).optional(),
  consent_type: z.enum(['one_time', 'annual', 'standing']).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/engagement/form-templates')
@UseGuards(AuthGuard, PermissionGuard)
export class FormTemplatesController {
  constructor(private readonly formTemplatesService: FormTemplatesService) {}

  // POST /v1/engagement/form-templates
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('engagement.form_templates.create')
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createEngagementFormTemplateSchema))
    dto: CreateEngagementFormTemplateDto,
  ) {
    return this.formTemplatesService.create(tenant.tenant_id, dto, user.sub);
  }

  // GET /v1/engagement/form-templates
  @Get()
  @RequiresPermission('engagement.form_templates.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listFormTemplatesQuerySchema))
    query: z.infer<typeof listFormTemplatesQuerySchema>,
  ) {
    return this.formTemplatesService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/engagement/form-templates/:id
  @Get(':id')
  @RequiresPermission('engagement.form_templates.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formTemplatesService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/engagement/form-templates/:id
  @Patch(':id')
  @RequiresPermission('engagement.form_templates.edit')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEngagementFormTemplateSchema))
    dto: UpdateEngagementFormTemplateDto,
  ) {
    return this.formTemplatesService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/engagement/form-templates/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('engagement.form_templates.delete')
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.formTemplatesService.delete(tenant.tenant_id, id);
  }

  // POST /v1/engagement/form-templates/:id/publish
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('engagement.form_templates.publish')
  async publish(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formTemplatesService.publish(tenant.tenant_id, id);
  }

  // POST /v1/engagement/form-templates/:id/archive
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('engagement.form_templates.publish')
  async archive(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formTemplatesService.archive(tenant.tenant_id, id);
  }

  // POST /v1/engagement/form-templates/:id/distribute
  @Post(':id/distribute')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('engagement.form_templates.publish')
  async distribute(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(distributeFormSchema)) dto: DistributeFormDto,
  ) {
    return this.formTemplatesService.distribute(tenant.tenant_id, id, dto);
  }
}
