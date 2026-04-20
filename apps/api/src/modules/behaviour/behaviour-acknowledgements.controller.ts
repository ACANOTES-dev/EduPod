import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourAcknowledgementsService } from './behaviour-acknowledgements.service';

const acknowledgementListQuerySchema = z.object({
  incident_id: z.string().uuid().optional(),
  sanction_id: z.string().uuid().optional(),
  amendment_notice_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'acknowledged']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAcknowledgementsController {
  constructor(private readonly acknowledgementsService: BehaviourAcknowledgementsService) {}

  @Get('behaviour/acknowledgements')
  @RequiresPermission('behaviour.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(acknowledgementListQuerySchema))
    query: z.infer<typeof acknowledgementListQuerySchema>,
  ) {
    return this.acknowledgementsService.list(tenant.tenant_id, query);
  }

  @Get('behaviour/acknowledgements/:id')
  @RequiresPermission('behaviour.view')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.acknowledgementsService.getById(tenant.tenant_id, id);
  }
}
