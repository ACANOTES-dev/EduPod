import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  aiParseInputSchema,
  aiQuerySchema,
  aiStudentSummaryQuerySchema,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { RequiresAiFlag } from '../../ai-flags/decorators/requires-ai-flag.decorator';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';

import { BehaviourAiParseService } from './behaviour-ai-parse.service';
import { BehaviourAiSummaryService } from './behaviour-ai-summary.service';
import { BehaviourAIService } from './behaviour-ai.service';

const historyPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * BehaviourAIController — single home for the four behaviour AI routes.
 *
 * All routes gated by the tenant-level `@RequiresAiFlag('behaviour')`
 * plus per-endpoint `@RequiresPermission` plus the usual auth guard.
 */
@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAIController {
  constructor(
    private readonly parseService: BehaviourAiParseService,
    private readonly summaryService: BehaviourAiSummaryService,
    private readonly queryService: BehaviourAIService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  // POST /v1/behaviour/incidents/ai-parse
  @Post('behaviour/incidents/ai-parse')
  @RequiresAiFlag('behaviour')
  @RequiresPermission('behaviour.log')
  @HttpCode(HttpStatus.OK)
  async aiParse(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiParseInputSchema))
    body: z.infer<typeof aiParseInputSchema>,
  ) {
    const data = await this.parseService.parse(tenant.tenant_id, user.sub, body.description);
    return { data };
  }

  // GET /v1/behaviour/students/:studentId/ai-summary
  @Get('behaviour/students/:studentId/ai-summary')
  @RequiresAiFlag('behaviour')
  @RequiresPermission('behaviour.view')
  async getStudentAiSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(aiStudentSummaryQuerySchema))
    query: z.infer<typeof aiStudentSummaryQuerySchema>,
  ) {
    const data = await this.summaryService.getSummary(
      tenant.tenant_id,
      studentId,
      query.from,
      query.to,
    );
    return { data };
  }

  // POST /v1/behaviour/analytics/ai-query
  @Post('behaviour/analytics/ai-query')
  @RequiresAiFlag('behaviour')
  @RequiresPermission('behaviour.ai_query')
  @HttpCode(HttpStatus.OK)
  async aiQuery(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiQuerySchema))
    input: z.infer<typeof aiQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const settings = await this.getBehaviourSettings(tenant.tenant_id);
    return this.queryService.processNLQuery(
      tenant.tenant_id,
      user.sub,
      permissions,
      input,
      settings,
    );
  }

  // GET /v1/behaviour/analytics/ai-query/history
  @Get('behaviour/analytics/ai-query/history')
  @RequiresAiFlag('behaviour')
  @RequiresPermission('behaviour.ai_query')
  async aiQueryHistory(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(historyPaginationSchema))
    query: z.infer<typeof historyPaginationSchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.queryService.getQueryHistory(
      tenant.tenant_id,
      user.sub,
      query.page,
      query.pageSize,
      permissions,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }

  private async getBehaviourSettings(tenantId: string): Promise<Record<string, unknown>> {
    const settingsJson = await this.configurationReadFacade.findSettingsJson(tenantId);
    const settings = (settingsJson as Record<string, unknown>) ?? {};
    return (settings?.behaviour as Record<string, unknown>) ?? {};
  }
}
