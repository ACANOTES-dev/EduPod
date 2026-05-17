import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  generatePlatformDailyBriefSchema,
  generatePlatformRecommendationSchema,
  listPlatformRecommendationsQuerySchema,
  resolvePlatformRecommendationSchema,
  type GeneratePlatformDailyBriefDto,
  type GeneratePlatformRecommendationDto,
  type JwtPayload,
  type ListPlatformRecommendationsQuery,
  type ResolvePlatformRecommendationDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { PlatformAiRecommendationService } from './platform-ai-recommendation.service';

@Controller('v1/admin/copilot')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformAiRecommendationController {
  constructor(private readonly recommendations: PlatformAiRecommendationService) {}

  // GET /v1/admin/copilot/recommendations
  @Get('recommendations')
  @RequiresPlatformPermission('platform.ai.read')
  async listRecommendations(
    @Query(new ZodValidationPipe(listPlatformRecommendationsQuerySchema))
    query: ListPlatformRecommendationsQuery,
  ) {
    return this.recommendations.list(query);
  }

  // POST /v1/admin/copilot/recommendations/generate
  @Post('recommendations/generate')
  @RequiresPlatformPermission('platform.ai.read')
  @SkipPlatformAudit(
    'Manual AI recommendation generation is retained in platform_ai_recommendations.',
  )
  async generateRecommendation(
    @Body(new ZodValidationPipe(generatePlatformRecommendationSchema))
    dto: GeneratePlatformRecommendationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.recommendations.generate({
      category: dto.category,
      context: dto.context,
      trigger_source: dto.trigger_source,
      user_id: user.sub,
      audit: auditContextFromRequest(user, request),
    });
  }

  // POST /v1/admin/copilot/briefs/daily
  @Post('briefs/daily')
  @RequiresPlatformPermission('platform.ai.read')
  @SkipPlatformAudit('On-demand daily AI brief is persisted in platform_ai_messages.')
  async generateDailyBrief(
    @Body(new ZodValidationPipe(generatePlatformDailyBriefSchema))
    dto: GeneratePlatformDailyBriefDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.recommendations.generateDailyBrief({
      since_hours: dto.since_hours,
      user_id: user.sub,
    });
  }

  // GET /v1/admin/copilot/recommendations/:id
  @Get('recommendations/:id')
  @RequiresPlatformPermission('platform.ai.read')
  async getRecommendation(@Param('id', ParseUUIDPipe) id: string) {
    return this.recommendations.get(id);
  }

  // POST /v1/admin/copilot/recommendations/:id/dismiss
  @Post('recommendations/:id/dismiss')
  @RequiresPlatformPermission('platform.ai.read')
  async dismissRecommendation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolvePlatformRecommendationSchema))
    dto: ResolvePlatformRecommendationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.recommendations.dismiss(id, {
      audit: auditContextFromRequest(user, request),
      reason: dto.reason,
      user_id: user.sub,
    });
  }

  // POST /v1/admin/copilot/recommendations/:id/accept
  @Post('recommendations/:id/accept')
  @RequiresPlatformPermission('platform.ai.read')
  async acceptRecommendation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolvePlatformRecommendationSchema))
    dto: ResolvePlatformRecommendationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.recommendations.accept(id, {
      audit: auditContextFromRequest(user, request),
      reason: dto.reason,
      user_id: user.sub,
    });
  }
}
