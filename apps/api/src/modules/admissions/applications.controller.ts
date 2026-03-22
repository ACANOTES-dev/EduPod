import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  admissionsAnalyticsSchema,
  createApplicationNoteSchema,
  convertApplicationSchema,
  listApplicationsSchema,
  reviewApplicationSchema,
} from '@school/shared';
import type {
  AdmissionsAnalyticsQuery,
  ConvertApplicationDto,
  CreateApplicationNoteDto,
  JwtPayload,
  ListApplicationsQuery,
  ReviewApplicationDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AdmissionsPaymentService } from './admissions-payment.service';
import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsService } from './applications.service';

@Controller('v1/applications')
@UseGuards(AuthGuard, PermissionGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly applicationNotesService: ApplicationNotesService,
    private readonly admissionsPaymentService: AdmissionsPaymentService,
  ) {}

  @Get()
  @RequiresPermission('admissions.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listApplicationsSchema))
    query: ListApplicationsQuery,
  ) {
    return this.applicationsService.findAll(tenant.tenant_id, query);
  }

  @Get('analytics')
  @RequiresPermission('admissions.view')
  async getAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsSchema))
    query: AdmissionsAnalyticsQuery,
  ) {
    return this.applicationsService.getAnalytics(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('admissions.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.findOne(tenant.tenant_id, id);
  }

  @Get(':id/preview')
  @RequiresPermission('admissions.view')
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.preview(tenant.tenant_id, id);
  }

  @Post(':id/review')
  @RequiresPermission('admissions.manage')
  async review(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewApplicationSchema))
    dto: ReviewApplicationDto,
  ) {
    return this.applicationsService.review(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  @Post(':id/withdraw')
  @RequiresPermission('admissions.manage')
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.withdraw(
      tenant.tenant_id,
      id,
      user.sub,
      false, // isParent = false (staff withdrawal)
    );
  }

  @Get(':id/conversion-preview')
  @RequiresPermission('admissions.manage')
  async getConversionPreview(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.getConversionPreview(
      tenant.tenant_id,
      id,
    );
  }

  @Post(':id/convert')
  @RequiresPermission('admissions.manage')
  async convert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(convertApplicationSchema))
    dto: ConvertApplicationDto,
  ) {
    return this.applicationsService.convert(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  @Get(':applicationId/notes')
  @RequiresPermission('admissions.view')
  async getNotes(
    @CurrentTenant() tenant: TenantContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applicationNotesService.findByApplication(
      tenant.tenant_id,
      applicationId,
      true, // includeInternal = true for staff
    );
  }

  @Post(':applicationId/notes')
  @RequiresPermission('admissions.manage')
  async createNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(createApplicationNoteSchema))
    dto: CreateApplicationNoteDto,
  ) {
    return this.applicationNotesService.create(
      tenant.tenant_id,
      applicationId,
      user.sub,
      dto,
    );
  }

  // ─── Admin Payment Endpoints ─────────────────────────────────────────────

  @Post(':id/mark-payment-received')
  @RequiresPermission('admissions.manage')
  async markPaymentReceived(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionsPaymentService.markPaymentReceived(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  @Post(':id/setup-payment-plan')
  @RequiresPermission('admissions.manage')
  async setupPaymentPlan(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionsPaymentService.setupPaymentPlan(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  @Post(':id/waive-fees')
  @RequiresPermission('admissions.manage')
  async waiveFees(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissionsPaymentService.waiveFees(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }
}
