import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import { engagementTrackSchema } from '@school/shared';
import type { Request } from 'express';
import type { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AuditLogService } from './audit-log.service';

@Controller('v1/engagement')
@UseGuards(AuthGuard)
export class EngagementController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Post('track')
  async track(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(engagementTrackSchema))
    body: z.infer<typeof engagementTrackSchema>,
    @Req() req: Request,
  ) {
    await this.auditLogService.track(
      tenant.tenant_id,
      user.sub,
      body.event_type,
      body.entity_type ?? null,
      body.entity_id ?? null,
      req.ip ?? '0.0.0.0',
    );

    return { ok: true };
  }
}
