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
import { amendmentListQuerySchema } from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourAmendmentsService } from './behaviour-amendments.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAmendmentsController {
  constructor(
    private readonly amendmentsService: BehaviourAmendmentsService,
  ) {}

  // ─── List Amendments ───────────────────────────────────────────────────────

  @Get('behaviour/amendments')
  @RequiresPermission('behaviour.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(amendmentListQuerySchema))
    filters: z.infer<typeof amendmentListQuerySchema>,
  ) {
    return this.amendmentsService.list(tenant.tenant_id, filters);
  }

  // ─── Pending Amendments (MUST be before :id to avoid route collision) ─────

  @Get('behaviour/amendments/pending')
  @RequiresPermission('behaviour.manage')
  async getPending(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.amendmentsService.getPending(
      tenant.tenant_id,
      query.page,
      query.pageSize,
    );
  }

  // ─── Get Amendment by ID ──────────────────────────────────────────────────

  @Get('behaviour/amendments/:id')
  @RequiresPermission('behaviour.manage')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.amendmentsService.getById(tenant.tenant_id, id);
  }

  // ─── Send Correction Notice ───────────────────────────────────────────────

  @Post('behaviour/amendments/:id/send-correction')
  @RequiresPermission('behaviour.amend')
  @HttpCode(HttpStatus.OK)
  async sendCorrection(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.amendmentsService.sendCorrection(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }
}
