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

import {
  forceApproveOverrideSchema,
  listAdmissionOverridesSchema,
  recordBankTransferSchema,
  recordCashPaymentSchema,
} from '@school/shared';
import type {
  ForceApproveOverrideDto,
  JwtPayload,
  ListAdmissionOverridesQuery,
  RecordBankTransferDto,
  RecordCashPaymentDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AdmissionsPaymentService } from './admissions-payment.service';

// ─────────────────────────────────────────────────────────────────────────────
// Payment recording endpoints — cash, bank transfer, admin override. All three
// operate against a conditional_approval application. On success, the
// application advances to `approved`, a Student record is materialised, and
// (for overrides) an AdmissionOverride audit row is written.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/applications/:id/payment')
@UseGuards(AuthGuard, PermissionGuard)
export class AdmissionsPaymentController {
  constructor(private readonly service: AdmissionsPaymentService) {}

  // POST /v1/applications/:id/payment/cash
  @Post('cash')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async recordCash(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(recordCashPaymentSchema)) dto: RecordCashPaymentDto,
  ) {
    return this.service.recordCashPayment(tenant.tenant_id, applicationId, {
      actingUserId: user.sub,
      amountCents: dto.amount_cents,
      receiptNumber: dto.receipt_number,
      notes: dto.notes,
    });
  }

  // POST /v1/applications/:id/payment/bank-transfer
  @Post('bank-transfer')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async recordBankTransfer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(recordBankTransferSchema)) dto: RecordBankTransferDto,
  ) {
    return this.service.recordBankTransfer(tenant.tenant_id, applicationId, {
      actingUserId: user.sub,
      amountCents: dto.amount_cents,
      transferReference: dto.transfer_reference,
      transferDate: dto.transfer_date,
      notes: dto.notes,
    });
  }

  // POST /v1/applications/:id/payment/override
  @Post('override')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async forceApproveOverride(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(forceApproveOverrideSchema)) dto: ForceApproveOverrideDto,
  ) {
    return this.service.forceApproveWithOverride(tenant.tenant_id, applicationId, {
      actingUserId: user.sub,
      overrideType: dto.override_type,
      actualAmountCollectedCents: dto.actual_amount_collected_cents,
      justification: dto.justification,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Override listing — mounted under a separate prefix to avoid colliding with
// `/v1/applications/:id` in ApplicationsController. Returns paginated audit
// rows for the "who approved without payment, when, and why" log.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/admission-overrides')
@UseGuards(AuthGuard, PermissionGuard)
export class AdmissionOverridesController {
  constructor(private readonly service: AdmissionsPaymentService) {}

  // GET /v1/admission-overrides
  @Get()
  @RequiresPermission('admissions.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listAdmissionOverridesSchema))
    query: ListAdmissionOverridesQuery,
  ) {
    return this.service.listOverrides(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
