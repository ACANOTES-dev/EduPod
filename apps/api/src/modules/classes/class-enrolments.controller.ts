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
  bulkEnrolSchema,
  createEnrolmentSchema,
  updateEnrolmentStatusSchema,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassEnrolmentsService } from './class-enrolments.service';
import type { BulkEnrolDto } from './dto/bulk-enrol.dto';
import type { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import type { UpdateEnrolmentStatusDto } from './dto/update-enrolment-status.dto';

const enrolmentStatusQuerySchema = z.object({
  status: z.enum(['active', 'dropped', 'completed']).optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class ClassEnrolmentsController {
  constructor(private readonly classEnrolmentsService: ClassEnrolmentsService) {}

  @Get('classes/:classId/enrolments')
  @RequiresPermission('students.view')
  async findAllForClass(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(enrolmentStatusQuerySchema))
    query: z.infer<typeof enrolmentStatusQuerySchema>,
  ) {
    return this.classEnrolmentsService.findAllForClass(
      tenant.tenant_id,
      classId,
      query.status,
    );
  }

  @Post('classes/:classId/enrolments')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodValidationPipe(createEnrolmentSchema)) dto: CreateEnrolmentDto,
  ) {
    return this.classEnrolmentsService.create(tenant.tenant_id, classId, dto);
  }

  @Post('classes/:classId/enrolments/bulk')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async bulkEnrol(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodValidationPipe(bulkEnrolSchema)) dto: BulkEnrolDto,
  ) {
    return this.classEnrolmentsService.bulkEnrol(
      tenant.tenant_id,
      classId,
      dto,
    );
  }

  @Patch('class-enrolments/:id/status')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEnrolmentStatusSchema))
    dto: UpdateEnrolmentStatusDto,
  ) {
    return this.classEnrolmentsService.updateStatus(
      tenant.tenant_id,
      id,
      dto,
    );
  }
}
