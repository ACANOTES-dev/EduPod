import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  addStudentToHouseholdSchema,
  createHouseholdSchema,
  emergencyContactSchema,
  mergeHouseholdSchema,
  splitHouseholdSchema,
  updateHouseholdSchema,
} from '@school/shared';
import type {
  AddStudentToHouseholdDto,
  CreateHouseholdDto,
  EmergencyContactDto,
  JwtPayload,
  MergeHouseholdDto,
  SplitHouseholdDto,
  TenantContext,
  UpdateHouseholdDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RegistrationService } from '../registration/registration.service';

import { HouseholdsService } from './households.service';

const householdQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  search: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'archived']),
});

const setBillingParentSchema = z.object({
  parent_id: z.string().uuid(),
});

const linkParentSchema = z.object({
  parent_id: z.string().uuid(),
  role_label: z.string().max(100).optional(),
});

@Controller('v1/households')
@UseGuards(AuthGuard, PermissionGuard)
export class HouseholdsController {
  constructor(
    private readonly householdsService: HouseholdsService,
    private readonly registrationService: RegistrationService,
  ) {}

  @Post()
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createHouseholdSchema)) dto: CreateHouseholdDto,
  ) {
    return this.householdsService.create(tenant.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(householdQuerySchema))
    query: z.infer<typeof householdQuerySchema>,
  ) {
    return this.householdsService.findAll(tenant.tenant_id, query);
  }

  @Get('merge')
  // This is a placeholder to prevent route conflict — actual merge is POST /merge
  @RequiresPermission('students.view')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  mergeGet() {
    return { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /merge' } };
  }

  @Post('merge')
  @RequiresPermission('students.manage')
  async merge(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(mergeHouseholdSchema)) dto: MergeHouseholdDto,
  ) {
    return this.householdsService.merge(tenant.tenant_id, dto);
  }

  @Post('split')
  @RequiresPermission('students.manage')
  async split(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(splitHouseholdSchema)) dto: SplitHouseholdDto,
  ) {
    return this.householdsService.split(tenant.tenant_id, dto);
  }

  @Get(':id')
  @RequiresPermission('students.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.householdsService.findOne(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHouseholdSchema)) dto: UpdateHouseholdDto,
  ) {
    return this.householdsService.update(tenant.tenant_id, id, dto);
  }

  @Patch(':id/status')
  @RequiresPermission('students.manage')
  async updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusUpdateSchema))
    body: z.infer<typeof statusUpdateSchema>,
  ) {
    return this.householdsService.updateStatus(tenant.tenant_id, id, body.status);
  }

  @Put(':id/billing-parent')
  @RequiresPermission('students.manage')
  async setBillingParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setBillingParentSchema))
    body: z.infer<typeof setBillingParentSchema>,
  ) {
    return this.householdsService.setBillingParent(tenant.tenant_id, id, body.parent_id);
  }

  @Post(':id/emergency-contacts')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async addEmergencyContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(emergencyContactSchema)) dto: EmergencyContactDto,
  ) {
    return this.householdsService.addEmergencyContact(tenant.tenant_id, id, dto);
  }

  @Patch(':householdId/emergency-contacts/:contactId')
  @RequiresPermission('students.manage')
  async updateEmergencyContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(emergencyContactSchema)) dto: EmergencyContactDto,
  ) {
    return this.householdsService.updateEmergencyContact(
      tenant.tenant_id,
      householdId,
      contactId,
      dto,
    );
  }

  @Delete(':householdId/emergency-contacts/:contactId')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeEmergencyContact(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.householdsService.removeEmergencyContact(
      tenant.tenant_id,
      householdId,
      contactId,
    );
  }

  @Post(':id/parents')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async linkParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(linkParentSchema))
    body: z.infer<typeof linkParentSchema>,
  ) {
    return this.householdsService.linkParent(
      tenant.tenant_id,
      id,
      body.parent_id,
      body.role_label,
    );
  }

  @Delete(':householdId/parents/:parentId')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
  ) {
    return this.householdsService.unlinkParent(
      tenant.tenant_id,
      householdId,
      parentId,
    );
  }

  @Post(':id/students')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async addStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addStudentToHouseholdSchema)) dto: AddStudentToHouseholdDto,
  ) {
    return this.registrationService.addStudentToHousehold(tenant.tenant_id, user.sub, id, dto);
  }

  @Get(':id/preview')
  @RequiresPermission('students.view')
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.householdsService.preview(tenant.tenant_id, id);
  }
}
