import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createFormDefinitionSchema,
  listFormDefinitionsSchema,
  updateFormDefinitionSchema,
} from '@school/shared';
import type {
  CreateFormDefinitionDto,
  ListFormDefinitionsQuery,
  TenantContext,
  UpdateFormDefinitionDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AdmissionFormsService } from './admission-forms.service';

@Controller('v1/admission-forms')
@UseGuards(AuthGuard, PermissionGuard)
export class AdmissionFormsController {
  constructor(
    private readonly admissionFormsService: AdmissionFormsService,
  ) {}

  @Post()
  @RequiresPermission('admissions.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFormDefinitionSchema))
    dto: CreateFormDefinitionDto,
  ) {
    return this.admissionFormsService.create(tenant.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('admissions.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listFormDefinitionsSchema))
    query: ListFormDefinitionsQuery,
  ) {
    return this.admissionFormsService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('admissions.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionFormsService.findOne(tenant.tenant_id, id);
  }

  @Put(':id')
  @RequiresPermission('admissions.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFormDefinitionSchema))
    dto: UpdateFormDefinitionDto,
  ) {
    return this.admissionFormsService.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/publish')
  @RequiresPermission('admissions.manage')
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionFormsService.publish(tenant.tenant_id, id);
  }

  @Post(':id/archive')
  @RequiresPermission('admissions.manage')
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionFormsService.archive(tenant.tenant_id, id);
  }

  @Get(':id/versions')
  @RequiresPermission('admissions.view')
  async getVersions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionFormsService.getVersions(tenant.tenant_id, id);
  }
}
