import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { healthHistoryQuerySchema, type HealthHistoryQuery } from '@school/shared';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HealthSnapshotService } from './health-snapshot.service';

@Controller('v1/admin/health')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class HealthHistoryController {
  constructor(private readonly healthSnapshotService: HealthSnapshotService) {}

  // GET /v1/admin/health/history
  @Get('history')
  @RequiresPlatformPermission('platform.alerts.view')
  async getHistory(
    @Query(new ZodValidationPipe(healthHistoryQuerySchema)) query: HealthHistoryQuery,
  ) {
    return this.healthSnapshotService.getHistory(query.hours, query.component);
  }
}
