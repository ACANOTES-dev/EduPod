import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ParentTimetableService } from './parent-timetable.service';

// ─── Query schema ─────────────────────────────────────────────────────────────

const parentTimetableQuerySchema = z.object({
  student_id: z.string().uuid(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Parent-scoped timetable endpoint delivered under SCHED-035.
 * Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/timetable-tab.tsx`.
 */
@Controller('v1/parent')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentTimetableController {
  constructor(private readonly parentTimetableService: ParentTimetableService) {}

  // GET /v1/parent/timetable?student_id=<uuid>
  @Get('timetable')
  @RequiresPermission('parent.view_timetable')
  async getChildTimetable(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentTimetableQuerySchema))
    query: z.infer<typeof parentTimetableQuerySchema>,
  ) {
    return this.parentTimetableService.getStudentTimetable(
      tenant.tenant_id,
      user.sub,
      query.student_id,
    );
  }

  // GET /v1/parent/timetable/self — SCHED-032 student self-view.
  @Get('timetable/self')
  @RequiresPermission('parent.view_timetable')
  async getSelfTimetable(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.parentTimetableService.getSelfTimetable(tenant.tenant_id, user.sub);
  }
}
