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

import {
  createAssessmentCategorySchema,
  reviewConfigSchema,
  updateAssessmentCategorySchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AssessmentCategoriesService } from './assessment-categories.service';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AssessmentCategoriesController {
  constructor(private readonly assessmentCategoriesService: AssessmentCategoriesService) {}

  @Post('gradebook/assessment-categories')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAssessmentCategorySchema))
    dto: z.infer<typeof createAssessmentCategorySchema>,
  ) {
    return this.assessmentCategoriesService.create(tenant.tenant_id, user.sub, dto);
  }

  @Get('gradebook/assessment-categories')
  @RequiresPermission('gradebook.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query() query: Record<string, string>,
  ) {
    return this.assessmentCategoriesService.findAll(tenant.tenant_id, {
      subject_id: query.subject_id,
      year_group_id: query.year_group_id,
      status: query.status,
    });
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
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAssessmentCategorySchema))
    dto: z.infer<typeof updateAssessmentCategorySchema>,
  ) {
    return this.assessmentCategoriesService.update(tenant.tenant_id, id, user.sub, dto);
  }

  @Delete('gradebook/assessment-categories/:id')
  @RequiresPermission('gradebook.manage')
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentCategoriesService.delete(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/gradebook/assessment-categories/:id/submit
  @Post('gradebook/assessment-categories/:id/submit')
  @RequiresPermission('gradebook.manage_own_config')
  async submitForApproval(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentCategoriesService.submitForApproval(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/gradebook/assessment-categories/:id/review
  @Post('gradebook/assessment-categories/:id/review')
  @RequiresPermission('gradebook.approve_config')
  async review(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewConfigSchema))
    dto: z.infer<typeof reviewConfigSchema>,
  ) {
    return this.assessmentCategoriesService.review(tenant.tenant_id, id, user.sub, dto);
  }
}
