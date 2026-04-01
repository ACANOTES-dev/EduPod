import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { replaceAvailabilitySchema } from '@school/shared';
import type { ReplaceAvailabilityDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { StaffAvailabilityService } from './staff-availability.service';

const listAvailabilityQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid().optional(),
});

@Controller('v1/staff-availability')
@UseGuards(AuthGuard, PermissionGuard)
export class StaffAvailabilityController {
  constructor(private readonly staffAvailabilityService: StaffAvailabilityService) {}

  @Get()
  @RequiresPermission('schedule.configure_availability')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listAvailabilityQuerySchema))
    query: z.infer<typeof listAvailabilityQuerySchema>,
  ) {
    return this.staffAvailabilityService.findAll(
      tenant.tenant_id,
      query.academic_year_id,
      query.staff_profile_id,
    );
  }

  @Put('staff/:staffProfileId/year/:academicYearId')
  @RequiresPermission('schedule.configure_availability')
  @HttpCode(HttpStatus.OK)
  async replaceForStaff(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Param('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Body(new ZodValidationPipe(replaceAvailabilitySchema)) dto: ReplaceAvailabilityDto,
  ) {
    return this.staffAvailabilityService.replaceForStaff(
      tenant.tenant_id,
      staffProfileId,
      academicYearId,
      dto.entries,
    );
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_availability')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffAvailabilityService.delete(tenant.tenant_id, id);
  }
}
