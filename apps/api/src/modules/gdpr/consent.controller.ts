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
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  bulkGrantConsentsSchema,
  getConsentsByTypeQuerySchema,
  grantConsentSchema,
  type BulkGrantConsentsDto,
  type GetConsentsByTypeQueryDto,
  type GrantConsentDto,
} from '@school/shared/gdpr';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ConsentService } from './consent.service';

@Controller('v1/consent')
@UseGuards(AuthGuard, PermissionGuard)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  @RequiresPermission('consent.manage')
  @HttpCode(HttpStatus.CREATED)
  async grantConsent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(grantConsentSchema))
    dto: GrantConsentDto,
  ) {
    return this.consentService.grantConsent(
      tenant.tenant_id,
      dto.subject_type,
      dto.subject_id,
      dto.consent_type,
      user.sub,
      dto.evidence_type,
      dto.notes,
      dto.privacy_notice_version_id,
    );
  }

  @Patch(':id/withdraw')
  @RequiresPermission('consent.manage')
  async withdrawConsent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consentService.withdrawConsent(tenant.tenant_id, id, user.sub);
  }

  @Get('subject/:type/:id')
  @RequiresPermission('consent.view')
  async getConsentsForSubject(
    @CurrentTenant() tenant: TenantContext,
    @Param('type') type: GrantConsentDto['subject_type'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consentService.getConsentsForSubject(tenant.tenant_id, type, id);
  }

  @Get('type/:consentType')
  @RequiresPermission('consent.manage')
  async getConsentsByType(
    @CurrentTenant() tenant: TenantContext,
    @Param('consentType') consentType: GrantConsentDto['consent_type'],
    @Query(new ZodValidationPipe(getConsentsByTypeQuerySchema))
    query: GetConsentsByTypeQueryDto,
  ) {
    return this.consentService.getConsentsByType(tenant.tenant_id, consentType, query);
  }

  @Post('bulk')
  @RequiresPermission('consent.manage')
  @HttpCode(HttpStatus.CREATED)
  async bulkGrantConsents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkGrantConsentsSchema))
    dto: BulkGrantConsentsDto,
  ) {
    return this.consentService.bulkGrantConsents(
      tenant.tenant_id,
      dto.subject_type,
      dto.subject_id,
      dto.consents,
      user.sub,
    );
  }
}
