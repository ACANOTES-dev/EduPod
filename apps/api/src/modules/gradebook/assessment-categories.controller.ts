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
  UseGuards,
} from '@nestjs/common';
import {
  createAssessmentCategorySchema,
  updateAssessmentCategorySchema,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AssessmentCategoriesService } from './assessment-categories.service';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AssessmentCategoriesController {
  constructor(
    private readonly assessmentCategoriesService: AssessmentCategoriesService,
  ) {}

  @Post('gradebook/assessment-categories')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createAssessmentCategorySchema))
    dto: z.infer<typeof createAssessmentCategorySchema>,
  ) {
    return this.assessmentCategoriesService.create(tenant.tenant_id, dto);
  }

  @Get('gradebook/assessment-categories')
  @RequiresPermission('gradebook.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
  ) {
    return this.assessmentCategoriesService.findAll(tenant.tenant_id);
  }

  @Get('gradebook/assessment-categories/:id')
  @RequiresPermission('gradebook.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentCategoriesService.findOne(tenant.tenant_id, id);
  }

  @Patch('gradebook/assessment-categories/:id')
  @RequiresPermission('gradebook.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAssessmentCategorySchema))
    dto: z.infer<typeof updateAssessmentCategorySchema>,
  ) {
    return this.assessmentCategoriesService.update(tenant.tenant_id, id, dto);
  }

  @Delete('gradebook/assessment-categories/:id')
  @RequiresPermission('gradebook.manage')
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentCategoriesService.delete(tenant.tenant_id, id);
  }
}
