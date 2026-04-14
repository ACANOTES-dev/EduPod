import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayrollAttendanceService } from './payroll-attendance.service';

const periodQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' }),
});

@Controller('v1/payroll')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollAttendanceController {
  constructor(private readonly payrollAttendanceService: PayrollAttendanceService) {}

  // GET /v1/payroll/absence-periods?period=YYYY-MM
  @Get('absence-periods')
  @RequiresPermission('payroll.manage_attendance')
  async getAbsencePeriodSummary(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(periodQuerySchema))
    query: z.infer<typeof periodQuerySchema>,
  ) {
    return this.payrollAttendanceService.getAbsencePeriodSummary(tenant.tenant_id, query.period);
  }
}
