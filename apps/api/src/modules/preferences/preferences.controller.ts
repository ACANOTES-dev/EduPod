import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateUiPreferencesSchema } from '@school/shared';
import type {
  JwtPayload,
  TenantContext,
  UpdateUiPreferencesDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PreferencesService } from './preferences.service';

@Controller('v1/me/preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  async getPreferences(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.preferencesService.getPreferences(tenant.tenant_id, user.sub);
  }

  @Patch()
  async updatePreferences(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateUiPreferencesSchema))
    dto: UpdateUiPreferencesDto,
  ) {
    return this.preferencesService.updatePreferences(
      tenant.tenant_id,
      user.sub,
      dto,
    );
  }
}
