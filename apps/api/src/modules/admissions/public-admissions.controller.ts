import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { createPublicApplicationSchema } from '@school/shared';
import type { CreatePublicApplicationDto, TenantContext } from '@school/shared';
import type { Request } from 'express';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AdmissionFormsService } from './admission-forms.service';
import { ApplicationsService } from './applications.service';

@Controller('v1/public/admissions')
export class PublicAdmissionsController {
  constructor(
    private readonly admissionFormsService: AdmissionFormsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  @Get('form')
  async getPublishedForm(@CurrentTenant() tenant: TenantContext) {
    return this.admissionFormsService.getPublishedForm(tenant.tenant_id);
  }

  @Post('applications')
  async createApplication(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createPublicApplicationSchema))
    dto: CreatePublicApplicationDto,
    @Req() req: Request,
  ) {
    const ip = this.extractClientIp(req);
    return this.applicationsService.createPublic(
      tenant.tenant_id,
      dto,
      ip,
    );
  }

  private extractClientIp(req: Request): string {
    // Check x-forwarded-for header first (for reverse proxy setups)
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0]?.split(',')[0]?.trim() ?? 'unknown';
    }
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
