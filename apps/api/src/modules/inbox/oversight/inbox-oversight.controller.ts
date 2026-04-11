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

import type { JwtPayload } from '@school/shared';
import {
  flagReviewNotesBodySchema,
  freezeConversationBodySchema,
  listOversightAuditLogQuerySchema,
  listOversightConversationsQuerySchema,
  listOversightFlagsQuerySchema,
  oversightSearchQuerySchema,
} from '@school/shared/inbox';
import type {
  FlagReviewNotesDto,
  FreezeConversationDto,
  ListOversightAuditLogQueryDto,
  ListOversightConversationsQueryDto,
  ListOversightFlagsQueryDto,
  OversightSearchQueryDto,
} from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AdminTierOnlyGuard } from '../common/admin-tier-only.guard';

import { InboxOversightService } from './inbox-oversight.service';

/**
 * Oversight controller — privileged surface for Owner / Principal /
 * Vice Principal. Every endpoint is protected by three gates:
 *
 *   1. AuthGuard — valid JWT
 *   2. PermissionGuard — `inbox.oversight.read` or `inbox.oversight.write`
 *   3. AdminTierOnlyGuard — belt-and-braces role check
 *
 * All mutating endpoints are POST (no PATCH) so the frontend does not
 * need to think about partial update semantics.
 */
@Controller('v1/inbox/oversight')
@UseGuards(AuthGuard, PermissionGuard, AdminTierOnlyGuard)
export class InboxOversightController {
  constructor(private readonly oversightService: InboxOversightService) {}

  // GET /v1/inbox/oversight/conversations
  @Get('conversations')
  @RequiresPermission('inbox.oversight.read')
  async listAllConversations(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listOversightConversationsQuerySchema))
    query: ListOversightConversationsQueryDto,
  ) {
    return this.oversightService.listAllConversations({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      filter: {
        kind: query.kind,
        fromDate: query.fromDate,
        toDate: query.toDate,
        participantUserId: query.participantUserId,
        hasFlags: query.hasFlags,
        frozen: query.frozen,
      },
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }

  // GET /v1/inbox/oversight/conversations/:id
  @Get('conversations/:id')
  @RequiresPermission('inbox.oversight.read')
  async getThread(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.oversightService.getThread({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      conversationId,
    });
  }

  // GET /v1/inbox/oversight/search
  @Get('search')
  @RequiresPermission('inbox.oversight.read')
  async searchAll(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(oversightSearchQuerySchema))
    query: OversightSearchQueryDto,
  ) {
    return this.oversightService.searchAll({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      query: query.q,
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }

  // POST /v1/inbox/oversight/conversations/:id/freeze
  @Post('conversations/:id/freeze')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.oversight.write')
  async freezeConversation(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(freezeConversationBodySchema)) body: FreezeConversationDto,
  ) {
    return this.oversightService.freezeConversation({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      conversationId,
      reason: body.reason,
    });
  }

  // POST /v1/inbox/oversight/conversations/:id/unfreeze
  @Post('conversations/:id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.oversight.write')
  async unfreezeConversation(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.oversightService.unfreezeConversation({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      conversationId,
    });
  }

  // POST /v1/inbox/oversight/conversations/:id/export
  @Post('conversations/:id/export')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.oversight.write')
  async exportThread(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.oversightService.exportThread({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      conversationId,
    });
  }

  // GET /v1/inbox/oversight/flags
  @Get('flags')
  @RequiresPermission('inbox.oversight.read')
  async listFlags(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listOversightFlagsQuerySchema))
    query: ListOversightFlagsQueryDto,
  ) {
    return this.oversightService.listPendingFlags({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      pagination: { page: query.page, pageSize: query.pageSize },
      reviewState: query.review_state,
    });
  }

  // POST /v1/inbox/oversight/flags/:id/dismiss
  @Post('flags/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.oversight.write')
  async dismissFlag(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) flagId: string,
    @Body(new ZodValidationPipe(flagReviewNotesBodySchema)) body: FlagReviewNotesDto,
  ) {
    await this.oversightService.dismissFlag({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      flagId,
      notes: body.notes,
    });
    return { dismissed: true };
  }

  // POST /v1/inbox/oversight/flags/:id/escalate
  @Post('flags/:id/escalate')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.oversight.write')
  async escalateFlag(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) flagId: string,
    @Body(new ZodValidationPipe(flagReviewNotesBodySchema)) body: FlagReviewNotesDto,
  ) {
    return this.oversightService.escalateFlag({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      flagId,
      notes: body.notes,
    });
  }

  // GET /v1/inbox/oversight/audit-log
  @Get('audit-log')
  @RequiresPermission('inbox.oversight.read')
  async listAuditLog(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listOversightAuditLogQuerySchema))
    query: ListOversightAuditLogQueryDto,
  ) {
    return this.oversightService.listAuditLog({
      tenantId: tenantContext.tenant_id,
      actorUserId: user.sub,
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }
}
