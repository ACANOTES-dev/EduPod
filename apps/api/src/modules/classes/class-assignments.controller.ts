import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { bulkClassAssignmentSchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassAssignmentService } from './class-assignments.service';
import type { BulkClassAssignmentDto } from './dto/bulk-class-assignment.dto';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class ClassAssignmentsController {
  constructor(private readonly classAssignmentService: ClassAssignmentService) {}

  @Get('class-assignments')
  @RequiresPermission('students.manage')
  async getClassAssignments(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.classAssignmentService.getAssignments(tenant.tenant_id);
  }

  @Post('class-assignments/bulk')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async bulkAssign(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkClassAssignmentSchema)) dto: BulkClassAssignmentDto,
  ) {
    return this.classAssignmentService.bulkAssign(tenant.tenant_id, dto);
  }
}
