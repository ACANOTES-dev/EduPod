import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import {
  archiveConversationSchema,
  createConversationSchema,
  getThreadQuerySchema,
  listInboxQuerySchema,
  muteConversationSchema,
  sendMessageSchema,
} from '@school/shared/inbox';
import type {
  ArchiveConversationDto,
  CreateConversationDto,
  GetThreadQueryDto,
  ListInboxQueryDto,
  MuteConversationDto,
  SendMessageDto,
} from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { ConversationsReadFacade } from './conversations.read.facade';
import { ConversationsService, type ExtraChannel } from './conversations.service';

/**
 * ConversationsController — the regular-user surface for the inbox.
 *
 * Route table (all under `/v1/inbox`):
 *
 *   POST   /conversations                         create direct/group/broadcast (discriminator in body)
 *   POST   /conversations/:id/messages            send a reply
 *   GET    /conversations                         list inbox threads
 *   GET    /conversations/:id                     thread detail (paginated messages)
 *   POST   /conversations/:id/read                mark a single thread read
 *   POST   /conversations/read-all                mark all threads read
 *   PATCH  /conversations/:id/mute                mute / unmute
 *   PATCH  /conversations/:id/archive             archive / restore
 *   GET    /state                                 light poll endpoint (unread count, latest at)
 *
 * All endpoints gated by AuthGuard + PermissionGuard with
 * `inbox.send` (writes) / `inbox.read` (reads).
 */
@Controller('v1/inbox')
@UseGuards(AuthGuard, PermissionGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly readFacade: ConversationsReadFacade,
  ) {}

  // ─── Writes ─────────────────────────────────────────────────────────────────

  // POST /v1/inbox/conversations
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('inbox.send')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createConversationSchema)) dto: CreateConversationDto,
  ) {
    const tenantId = requireTenant(tenantContext);

    const extraChannels: ExtraChannel[] = (dto.extra_channels ?? []).filter(
      (c): c is ExtraChannel => c !== 'inbox',
    );
    const disableFallback = dto.disable_fallback ?? false;
    const attachments = dto.attachments ?? [];

    if (dto.kind === 'direct') {
      return this.conversations.createDirect({
        tenantId,
        senderUserId: user.sub,
        recipientUserId: dto.recipient_user_id!,
        body: dto.body,
        attachments,
        extraChannels,
        disableFallback,
      });
    }
    if (dto.kind === 'group') {
      return this.conversations.createGroup({
        tenantId,
        senderUserId: user.sub,
        recipientUserIds: dto.participant_user_ids!,
        subject: dto.subject ?? '',
        body: dto.body,
        attachments,
        extraChannels,
        disableFallback,
      });
    }
    // broadcast
    return this.conversations.createBroadcast({
      tenantId,
      senderUserId: user.sub,
      audienceDefinition: dto.audience,
      savedAudienceId: dto.saved_audience_id,
      subject: dto.subject ?? null,
      body: dto.body,
      attachments,
      allowReplies: dto.allow_replies ?? false,
      extraChannels,
      disableFallback,
    });
  }

  // POST /v1/inbox/conversations/:id/messages
  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('inbox.send')
  async reply(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    const extraChannels: ExtraChannel[] = (dto.extra_channels ?? []).filter(
      (c): c is ExtraChannel => c !== 'inbox',
    );
    return this.conversations.sendReply({
      tenantId,
      senderUserId: user.sub,
      conversationId,
      body: dto.body,
      attachments: dto.attachments ?? [],
      extraChannels,
      disableFallback: dto.disable_fallback ?? false,
    });
  }

  // POST /v1/inbox/conversations/read-all  (before /:id/* routes)
  @Post('conversations/read-all')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.read')
  async markAllRead(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenantId = requireTenant(tenantContext);
    await this.conversations.markAllRead(tenantId, user.sub);
    return { ok: true };
  }

  // POST /v1/inbox/conversations/:id/read
  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.read')
  async markRead(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    const tenantId = requireTenant(tenantContext);
    await this.conversations.markRead(tenantId, user.sub, conversationId);
    return { ok: true };
  }

  // PATCH /v1/inbox/conversations/:id/mute
  @Patch('conversations/:id/mute')
  @RequiresPermission('inbox.read')
  async setMuted(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(muteConversationSchema)) dto: MuteConversationDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    await this.conversations.setMuted(tenantId, user.sub, conversationId, dto.muted);
    return { ok: true };
  }

  // PATCH /v1/inbox/conversations/:id/archive
  @Patch('conversations/:id/archive')
  @RequiresPermission('inbox.read')
  async setArchived(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(archiveConversationSchema)) dto: ArchiveConversationDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    await this.conversations.setArchived(tenantId, user.sub, conversationId, dto.archived);
    return { ok: true };
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────

  // GET /v1/inbox/conversations
  @Get('conversations')
  @RequiresPermission('inbox.read')
  async list(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listInboxQuerySchema)) query: ListInboxQueryDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    return this.readFacade.listInbox({
      tenantId,
      userId: user.sub,
      filter: {
        archived: query.archived,
        unreadOnly: query.unread_only,
        kind: query.kind,
      },
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }

  // GET /v1/inbox/conversations/:id
  @Get('conversations/:id')
  @RequiresPermission('inbox.read')
  async getThread(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query(new ZodValidationPipe(getThreadQuerySchema)) query: GetThreadQueryDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    return this.readFacade.getThread({
      tenantId,
      userId: user.sub,
      conversationId,
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }

  // GET /v1/inbox/state
  @Get('state')
  @RequiresPermission('inbox.read')
  async getState(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenantId = requireTenant(tenantContext);
    return this.conversations.getInboxState(tenantId, user.sub);
  }
}

function requireTenant(ctx: { tenant_id: string } | null): string {
  if (!ctx) {
    throw new BadRequestException({
      code: 'TENANT_CONTEXT_MISSING',
      message: 'No tenant context — this endpoint is tenant-scoped',
    });
  }
  return ctx.tenant_id;
}
