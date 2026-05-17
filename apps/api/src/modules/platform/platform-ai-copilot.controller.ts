import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  listPlatformCopilotConversationsQuerySchema,
  sendPlatformCopilotMessageSchema,
  startPlatformCopilotConversationSchema,
  type JwtPayload,
  type ListPlatformCopilotConversationsQuery,
  type SendPlatformCopilotMessageDto,
  type StartPlatformCopilotConversationDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformAiCopilotService } from './platform-ai-copilot.service';

@Controller('v1/admin/copilot')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformAiCopilotController {
  constructor(private readonly copilot: PlatformAiCopilotService) {}

  // POST /v1/admin/copilot/conversations
  @Post('conversations')
  @RequiresPlatformPermission('platform.ai.read')
  @SkipPlatformAudit(
    'Read-only Copilot conversation creation is retained in platform_ai_conversations.',
  )
  async startConversation(
    @Body(new ZodValidationPipe(startPlatformCopilotConversationSchema))
    dto: StartPlatformCopilotConversationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.copilot.startConversation({
      context: dto.context,
      type: dto.type,
      user_id: user.sub,
    });
  }

  // POST /v1/admin/copilot/conversations/:id/messages
  @Post('conversations/:id/messages')
  @RequiresPlatformPermission('platform.ai.read')
  @SkipPlatformAudit('Read-only Copilot message persistence is retained in platform_ai_messages.')
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendPlatformCopilotMessageSchema))
    dto: SendPlatformCopilotMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.copilot.sendMessage({
      content: dto.content,
      context: dto.context,
      conversation_id: id,
      user_id: user.sub,
    });
  }

  // GET /v1/admin/copilot/conversations
  @Get('conversations')
  @RequiresPlatformPermission('platform.ai.read')
  async listConversations(
    @Query(new ZodValidationPipe(listPlatformCopilotConversationsQuerySchema))
    query: ListPlatformCopilotConversationsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.copilot.listConversations(user.sub, query.operator_id);
  }

  // GET /v1/admin/copilot/conversations/:id
  @Get('conversations/:id')
  @RequiresPlatformPermission('platform.ai.read')
  async getConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.copilot.getConversation(id, user.sub);
  }
}
