import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  ASK_AI_ERROR_CODES,
  askAiRequestSchema,
} from '@school/shared/reports';
import type { AskAiRequestDto, AskAiTranslationResult } from '@school/shared/reports';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { RequiresAiFlag } from '../../ai-flags/decorators/requires-ai-flag.decorator';
import { OWNER_SENTINEL_PERMISSION } from '../subject-registry/reports-subject-registry.service';

import { AiAskAiService } from './ai-ask-ai.service';

/**
 * `POST /v1/reports/ai-ask-ai` — natural-language → builder query.
 * `GET  /v1/reports/ai-ask-ai/history` — last 20 attempts for caller.
 * `POST /v1/reports/ai-ask-ai/history/:id/mark-saved` — flips `was_saved`.
 *
 * Every route is gated on:
 *   - `AuthGuard` — JWT
 *   - `PermissionGuard` + `@RequiresPermission('reports.ai.ask_ai')`
 *   - The globally-registered `AiFlagGuard` + `@RequiresAiFlag('reports_ask_ai')`
 *
 * The controller resolves the caller's effective permission set
 * (including the owner-bypass sentinel) before calling the service so
 * the prompt registry and the validator see the right field set.
 */
@Controller('v1/reports/ai-ask-ai')
@UseGuards(AuthGuard, PermissionGuard)
export class AiAskAiController {
  constructor(
    private readonly askAi: AiAskAiService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // POST /v1/reports/ai-ask-ai
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('reports.ai.ask_ai')
  @RequiresAiFlag('reports_ask_ai')
  async translate(
    @Body(new ZodValidationPipe(askAiRequestSchema)) body: AskAiRequestDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: AskAiTranslationResult }> {
    const permissions = await this.resolveEffectivePermissions(user);
    const result = await this.askAi.translate(
      tenant.tenant_id,
      user.sub,
      permissions,
      body.query_text,
    );
    return { data: result };
  }

  // GET /v1/reports/ai-ask-ai/history
  @Get('history')
  @RequiresPermission('reports.ai.ask_ai')
  @RequiresAiFlag('reports_ask_ai')
  async getHistory(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    if (Number.isNaN(limit) || limit < 1) {
      throw new BadRequestException({
        code: ASK_AI_ERROR_CODES.INVALID_REQUEST,
        message: '`limit` must be a positive integer.',
      });
    }
    const history = await this.askAi.getHistory(tenant.tenant_id, user.sub, limit);
    return {
      data: history,
      meta: { count: history.length },
    };
  }

  // POST /v1/reports/ai-ask-ai/history/:id/mark-saved
  @Post('history/:id/mark-saved')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('reports.ai.ask_ai')
  @RequiresAiFlag('reports_ask_ai')
  async markHistorySaved(
    @Param('id', ParseUUIDPipe) historyId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: { id: string; was_saved: true } }> {
    const updated = await this.askAi.markHistoryAsSaved(tenant.tenant_id, user.sub, historyId);
    if (!updated) {
      throw new NotFoundException({
        code: ASK_AI_ERROR_CODES.HISTORY_NOT_FOUND,
        message: `Ask-AI history entry "${historyId}" was not found for the caller.`,
      });
    }
    return { data: { id: historyId, was_saved: true } };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolve the caller's effective permission set, including the owner
   * bypass sentinel for school owner / principal / VP. Mirrors the
   * resolver used by `ReportsEnhancedController.previewReport` so the
   * registry-scoping is consistent across the builder and the AI path.
   */
  private async resolveEffectivePermissions(user: JwtPayload): Promise<string[]> {
    if (!user.membership_id) return [];
    const [permissions, owner] = await Promise.all([
      this.permissionCache.getPermissions(user.membership_id),
      this.permissionCache.isOwner(user.membership_id),
    ]);
    return owner ? [...permissions, OWNER_SENTINEL_PERMISSION] : permissions;
  }
}
