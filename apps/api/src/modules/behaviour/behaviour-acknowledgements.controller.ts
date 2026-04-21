import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Post('behaviour/acknowledgements/:id/read')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.acknowledgementsService.markAsRead(tenant.tenant_id, id, user.sub);
  }
}
