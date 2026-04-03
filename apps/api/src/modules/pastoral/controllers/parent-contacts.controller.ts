import {
  Body,
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
import { createParentContactSchema, parentContactFiltersSchema } from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ParentContactService } from '../services/parent-contact.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ParentContactsController {
  constructor(private readonly parentContactService: ParentContactService) {}

  // ─── 1. Log Parent Contact ────────────────────────────────────────────────

  @Post('pastoral/parent-contacts')
  @RequiresPermission('pastoral.view_tier1')
  @HttpCode(HttpStatus.CREATED)
  async logContact(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createParentContactSchema))
    dto: z.infer<typeof createParentContactSchema>,
  ) {
    return this.parentContactService.logContact(tenant.tenant_id, user.sub, dto);
  }

  // ─── 2. List Parent Contacts ──────────────────────────────────────────────

  @Get('pastoral/parent-contacts')
  @RequiresPermission('pastoral.view_tier1')
  async listContacts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(parentContactFiltersSchema))
    query: z.infer<typeof parentContactFiltersSchema>,
  ) {
    return this.parentContactService.listContacts(tenant.tenant_id, query);
  }

  // ─── 3. Get Parent Contact by ID ──────────────────────────────────────────

  @Get('pastoral/parent-contacts/:id')
  @RequiresPermission('pastoral.view_tier1')
  async getContact(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.parentContactService.getContact(tenant.tenant_id, id);
  }
}
