import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { healthHistoryQuerySchema, type HealthHistoryQuery } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// eslint-disable-next-line school/no-cross-module-internal-import -- Platform admin routes use the existing platform-owner guard.
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { HealthSnapshotService } from './health-snapshot.service';

@Controller('v1/admin/health')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class HealthHistoryController {
  constructor(private readonly healthSnapshotService: HealthSnapshotService) {}

  // GET /v1/admin/health/history
  @Get('history')
  async getHistory(
    @Query(new ZodValidationPipe(healthHistoryQuerySchema)) query: HealthHistoryQuery,
  ) {
    return this.healthSnapshotService.getHistory(query.hours, query.component);
  }
}
