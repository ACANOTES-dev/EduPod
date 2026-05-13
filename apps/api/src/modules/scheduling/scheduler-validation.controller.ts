import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SchedulerValidationService } from './scheduler-validation.service';

@Controller('v1/scheduling/runs/:id')
@ModuleEnabled('auto_scheduling')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SchedulerValidationController {
  constructor(private readonly service: SchedulerValidationService) {}

  @Post('validate')
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.validateRun(tenant.tenant_id, id);
  }
}
