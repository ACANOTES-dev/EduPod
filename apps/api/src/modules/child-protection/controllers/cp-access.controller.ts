import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';
import { grantCpAccessSchema, revokeCpAccessSchema } from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CpAccessService } from '../services/cp-access.service';

@Controller('v1/child-protection/access')
@UseGuards(AuthGuard, PermissionGuard)
export class CpAccessController {
  constructor(private readonly cpAccessService: CpAccessService) {}

  // ─── 1. Grant CP Access ───────────────────────────────────────────────────

  @Post('grant')
  @RequiresPermission('pastoral.manage_cp_access')
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(grantCpAccessSchema))
    dto: { user_id: string },
    @Req() req: Request,
  ) {
    return this.cpAccessService.grant(tenant.tenant_id, user.sub, dto, req.ip ?? null);
  }

  // ─── 2. Revoke CP Access ──────────────────────────────────────────────────

  @Delete(':grantId')
  @RequiresPermission('pastoral.manage_cp_access')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body(new ZodValidationPipe(revokeCpAccessSchema))
    dto: { revocation_reason: string },
    @Req() req: Request,
  ) {
    return this.cpAccessService.revoke(tenant.tenant_id, user.sub, grantId, dto, req.ip ?? null);
  }

  // ─── 3. List Active Grants ────────────────────────────────────────────────

  @Get('student/:studentId')
  @RequiresPermission('pastoral.manage_cp_access')
  async listActiveGrants(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.cpAccessService.listActive(tenant.tenant_id, user.sub);
  }

  // ─── 4. Check Own Access ──────────────────────────────────────────────────

  /**
   * Any authenticated user can check their own CP access status.
   * No additional permission required beyond AuthGuard.
   * Returns { has_access: boolean }
   */
  @Get('check/:studentId')
  async checkOwnAccess(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    const hasAccess = await this.cpAccessService.hasAccess(tenant.tenant_id, user.sub);
    return { data: { has_access: hasAccess } };
  }
}
