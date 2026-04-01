import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { submitCheckinSchema } from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CheckinService } from '../services/checkin.service';

// ─── Inline pagination schema for student's own history ─────────────────────

const myCheckinsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard)
export class CheckinsController {
  constructor(private readonly checkinService: CheckinService) {}

  // ─── 1. Submit Check-in ─────────────────────────────────────────────────

  @Post('pastoral/checkins')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitCheckinSchema))
    dto: z.infer<typeof submitCheckinSchema>,
  ) {
    return this.checkinService.submitCheckin(tenant.tenant_id, user.sub, user.sub, dto);
  }

  // ─── 2. Own Check-in History ────────────────────────────────────────────

  @Get('pastoral/checkins/my')
  async myCheckins(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(myCheckinsQuerySchema))
    query: z.infer<typeof myCheckinsQuerySchema>,
  ) {
    return this.checkinService.getMyCheckins(
      tenant.tenant_id,
      user.sub,
      query.page,
      query.pageSize,
    );
  }

  // ─── 3. Check-in Status ────────────────────────────────────────────────

  @Get('pastoral/checkins/status')
  async status(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.checkinService.getCheckinStatus(tenant.tenant_id, user.sub);
  }
}
