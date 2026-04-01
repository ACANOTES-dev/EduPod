import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { listContactSubmissionsSchema, updateContactStatusSchema } from '@school/shared';
import type {
  ListContactSubmissionsDto,
  TenantContext,
  UpdateContactStatusDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ContactFormService } from './contact-form.service';

@Controller('v1/contact-submissions')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('website')
export class ContactSubmissionsController {
  constructor(private readonly service: ContactFormService) {}

  @Get()
  @RequiresPermission('communications.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listContactSubmissionsSchema))
    query: ListContactSubmissionsDto,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  @Patch(':id/status')
  @RequiresPermission('communications.manage')
  async updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContactStatusSchema))
    dto: UpdateContactStatusDto,
  ) {
    return this.service.updateStatus(tenant.tenant_id, id, dto.status);
  }
}
