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
  UseGuards,
} from '@nestjs/common';
import type { TenantOnboardingStep } from '@prisma/client';

import {
  updateOnboardingStepSchema,
  type JwtPayload,
  type UpdateOnboardingStepDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { OnboardingService, type OnboardingTrackerResponse } from './onboarding.service';

@Controller('v1/admin/tenants')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // GET /v1/admin/tenants/:id/onboarding
  @Get(':id/onboarding')
  @RequiresPlatformPermission('platform.tenants.view')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<OnboardingTrackerResponse> {
    return this.onboardingService.getForTenant(id);
  }

  // PATCH /v1/admin/tenants/:id/onboarding/:stepId
  @Patch(':id/onboarding/:stepId')
  @RequiresPlatformPermission('platform.tenants.create')
  async updateStep(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodValidationPipe(updateOnboardingStepSchema)) dto: UpdateOnboardingStepDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantOnboardingStep> {
    return this.onboardingService.updateStep(tenantId, stepId, dto, user.sub);
  }

  // POST /v1/admin/tenants/:id/onboarding/reset
  @Post(':id/onboarding/reset')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.create')
  async reset(@Param('id', ParseUUIDPipe) tenantId: string): Promise<{ message: string }> {
    await this.onboardingService.resetForTenant(tenantId);
    return { message: 'Onboarding tracker reset successfully' };
  }
}
