import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { publicHouseholdLookupSchema } from '@school/shared';
import type { PublicHouseholdLookupDto, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PublicHouseholdsService } from './public-households.service';

@Controller('v1/public/households')
export class PublicHouseholdsController {
  constructor(private readonly service: PublicHouseholdsService) {}

  // POST /v1/public/households/lookup
  @Post('lookup')
  async lookup(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(publicHouseholdLookupSchema))
    dto: PublicHouseholdLookupDto,
    @Req() req: Request,
  ) {
    return this.service.lookupByNumberAndEmail(tenant.tenant_id, dto, this.extractClientIp(req));
  }

  private extractClientIp(req: Request): string {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0]?.trim() ?? 'unknown';
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
