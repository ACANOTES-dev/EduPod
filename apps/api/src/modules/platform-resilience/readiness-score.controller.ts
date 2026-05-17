import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import {
  type JwtPayload,
  updateReadinessDimensionWeightSchema,
  type UpdateReadinessDimensionWeightDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { assertDimension, ReadinessScoreService } from './readiness-score.service';

@Controller('v1/admin/readiness-score')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class ReadinessScoreController {
  constructor(private readonly readiness: ReadinessScoreService) {}

  // GET /v1/admin/readiness-score
  @Get()
  @RequiresPlatformPermission('platform.readiness.view')
  async current() {
    return this.readiness.compute();
  }

  // GET /v1/admin/readiness-score/history
  @Get('history')
  @RequiresPlatformPermission('platform.readiness.view')
  async history() {
    return this.readiness.history(90);
  }

  // GET /v1/admin/readiness-score/dimensions
  @Get('dimensions')
  @RequiresPlatformPermission('platform.readiness.view')
  async dimensions() {
    return this.readiness.dimensions();
  }

  // PATCH /v1/admin/readiness-score/dimensions/:dimension
  @Patch('dimensions/:dimension')
  @RequiresPlatformPermission('platform.readiness.manage')
  async updateDimension(
    @Param('dimension') dimension: string,
    @Body(new ZodValidationPipe(updateReadinessDimensionWeightSchema))
    dto: UpdateReadinessDimensionWeightDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    assertDimension(dimension);
    return this.readiness.updateWeight(
      dimension,
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
