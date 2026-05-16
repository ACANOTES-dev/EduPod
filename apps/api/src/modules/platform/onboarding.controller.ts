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
import type { TenantOnboardingStep } from '@prisma/client';
import type { Request } from 'express';

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
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

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
    @Req() request: Request,
  ): Promise<TenantOnboardingStep> {
    return this.onboardingService.updateStep(
      tenantId,
      stepId,
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  // POST /v1/admin/tenants/:id/onboarding/reset
  @Post(':id/onboarding/reset')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.create')
  async reset(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.onboardingService.resetForTenant(tenantId, auditContextFromRequest(user, request));
    return { message: 'Onboarding tracker reset successfully' };
  }
}
