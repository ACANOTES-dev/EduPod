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
import {
  createGradingScaleSchema,
  updateGradingScaleSchema,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { GradingScalesService } from './grading-scales.service';

// ─── Query Schemas ────────────────────────────────────────────────────────

const listGradingScalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class GradingScalesController {
  constructor(
    private readonly gradingScalesService: GradingScalesService,
  ) {}

  @Post('gradebook/grading-scales')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createGradingScaleSchema))
    dto: z.infer<typeof createGradingScaleSchema>,
  ) {
    return this.gradingScalesService.create(tenant.tenant_id, dto);
  }

  @Get('gradebook/grading-scales')
  @RequiresPermission('gradebook.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listGradingScalesQuerySchema))
    query: z.infer<typeof listGradingScalesQuerySchema>,
  ) {
    return this.gradingScalesService.findAll(tenant.tenant_id, query);
  }

  @Get('gradebook/grading-scales/:id')
  @RequiresPermission('gradebook.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gradingScalesService.findOne(tenant.tenant_id, id);
  }

  @Patch('gradebook/grading-scales/:id')
  @RequiresPermission('gradebook.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGradingScaleSchema))
    dto: z.infer<typeof updateGradingScaleSchema>,
  ) {
    return this.gradingScalesService.update(tenant.tenant_id, id, dto);
  }

  @Delete('gradebook/grading-scales/:id')
  @RequiresPermission('gradebook.manage')
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gradingScalesService.delete(tenant.tenant_id, id);
  }
}
