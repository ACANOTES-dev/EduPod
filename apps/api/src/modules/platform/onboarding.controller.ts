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
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// eslint-disable-next-line school/no-cross-module-internal-import -- Platform admin routes use the existing platform-owner guard.
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { OnboardingService, type OnboardingTrackerResponse } from './onboarding.service';

@Controller('v1/admin/tenants')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // GET /v1/admin/tenants/:id/onboarding
  @Get(':id/onboarding')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<OnboardingTrackerResponse> {
    return this.onboardingService.getForTenant(id);
  }

  // PATCH /v1/admin/tenants/:id/onboarding/:stepId
  @Patch(':id/onboarding/:stepId')
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
  async reset(@Param('id', ParseUUIDPipe) tenantId: string): Promise<{ message: string }> {
    await this.onboardingService.resetForTenant(tenantId);
    return { message: 'Onboarding tracker reset successfully' };
  }
}
