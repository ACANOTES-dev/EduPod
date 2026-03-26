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
import {
  createCategorySchema,
  createTemplateSchema,
  updateCategorySchema,
  updateTemplateSchema,
} from '@school/shared';
import type { TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourConfigService } from './behaviour-config.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const listTemplatesQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourConfigController {
  constructor(
    private readonly configService: BehaviourConfigService,
  ) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('behaviour/categories')
  @RequiresPermission('behaviour.view')
  async listCategories(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.configService.listCategories(tenant.tenant_id);
  }

  @Post('behaviour/categories')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCategorySchema))
    dto: z.infer<typeof createCategorySchema>,
  ) {
    return this.configService.createCategory(tenant.tenant_id, dto);
  }

  @Patch('behaviour/categories/:id')
  @RequiresPermission('behaviour.admin')
  async updateCategory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema))
    dto: z.infer<typeof updateCategorySchema>,
  ) {
    return this.configService.updateCategory(tenant.tenant_id, id, dto);
  }

  // ─── Description Templates ────────────────────────────────────────────────

  @Get('behaviour/description-templates')
  @RequiresPermission('behaviour.view')
  async listTemplates(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listTemplatesQuerySchema))
    query: z.infer<typeof listTemplatesQuerySchema>,
  ) {
    return this.configService.listTemplates(
      tenant.tenant_id,
      query.category_id,
    );
  }

  @Post('behaviour/description-templates')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTemplateSchema))
    dto: z.infer<typeof createTemplateSchema>,
  ) {
    return this.configService.createTemplate(tenant.tenant_id, dto);
  }

  @Patch('behaviour/description-templates/:id')
  @RequiresPermission('behaviour.admin')
  async updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema))
    dto: z.infer<typeof updateTemplateSchema>,
  ) {
    return this.configService.updateTemplate(tenant.tenant_id, id, dto);
  }
}
