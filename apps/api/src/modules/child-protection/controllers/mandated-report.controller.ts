import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CpAccessGuard } from '../guards/cp-access.guard';
import { MandatedReportService } from '../services/mandated-report.service';

// ─── Zod schemas ────────────────────────────────────────────────────────────

const submitMandatedReportSchema = z.object({
  tusla_reference: z.string().min(1).max(100),
});

const updateMandatedReportStatusSchema = z.object({
  status: z.enum(['acknowledged', 'outcome_received']),
  outcome_notes: z.string().max(5000).optional(),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/child-protection/cp-records/:cpRecordId/mandated-report')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, CpAccessGuard)
export class MandatedReportController {
  constructor(private readonly service: MandatedReportService) {}

  // GET /v1/child-protection/cp-records/:cpRecordId/mandated-report
  @Get()
  async get(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('cpRecordId', ParseUUIDPipe) cpRecordId: string,
    @Req() req: Request,
  ) {
    return this.service.getForCpRecord(tenant.tenant_id, user.sub, cpRecordId, req.ip ?? null);
  }

  // POST /v1/child-protection/cp-records/:cpRecordId/mandated-report
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDraft(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('cpRecordId', ParseUUIDPipe) cpRecordId: string,
    @Req() req: Request,
  ) {
    return this.service.createDraft(tenant.tenant_id, user.sub, cpRecordId, {}, req.ip ?? null);
  }

  // POST /v1/child-protection/cp-records/:cpRecordId/mandated-report/submit
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('cpRecordId', ParseUUIDPipe) cpRecordId: string,
    @Body(new ZodValidationPipe(submitMandatedReportSchema))
    dto: z.infer<typeof submitMandatedReportSchema>,
    @Req() req: Request,
  ) {
    return this.service.submit(tenant.tenant_id, user.sub, cpRecordId, dto, req.ip ?? null);
  }

  // PATCH /v1/child-protection/cp-records/:cpRecordId/mandated-report/status
  @Patch('status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('cpRecordId', ParseUUIDPipe) cpRecordId: string,
    @Body(new ZodValidationPipe(updateMandatedReportStatusSchema))
    dto: z.infer<typeof updateMandatedReportStatusSchema>,
    @Req() req: Request,
  ) {
    return this.service.updateStatus(tenant.tenant_id, user.sub, cpRecordId, dto, req.ip ?? null);
  }
}
