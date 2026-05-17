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
  approvePlatformAiActionProposalSchema,
  createPlatformAgentHandoffSchema,
  createPlatformAiActionProposalSchema,
  listPlatformAiActionProposalsQuerySchema,
  rejectPlatformAiActionProposalSchema,
  type ApprovePlatformAiActionProposalDto,
  type CreatePlatformAgentHandoffDto,
  type CreatePlatformAiActionProposalDto,
  type JwtPayload,
  type ListPlatformAiActionProposalsQuery,
  type RejectPlatformAiActionProposalDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { PlatformAiActionProposalsService } from './platform-ai-action-proposals.service';

@Controller('v1/admin/copilot')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformAiActionProposalsController {
  constructor(private readonly actionProposals: PlatformAiActionProposalsService) {}

  // POST /v1/admin/copilot/action-proposals
  @Post('action-proposals')
  @RequiresPlatformPermission('platform.ai.read')
  async createProposal(
    @Body(new ZodValidationPipe(createPlatformAiActionProposalSchema))
    dto: CreatePlatformAiActionProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.actionProposals.create(dto, user.sub, auditContextFromRequest(user, request));
  }

  // GET /v1/admin/copilot/action-proposals
  @Get('action-proposals')
  @RequiresPlatformPermission('platform.ai.read')
  async listProposals(
    @Query(new ZodValidationPipe(listPlatformAiActionProposalsQuerySchema))
    query: ListPlatformAiActionProposalsQuery,
  ) {
    return this.actionProposals.list(query);
  }

  // GET /v1/admin/copilot/action-proposals/:id
  @Get('action-proposals/:id')
  @RequiresPlatformPermission('platform.ai.read')
  async getProposal(@Param('id', ParseUUIDPipe) id: string) {
    return this.actionProposals.get(id);
  }

  // POST /v1/admin/copilot/action-proposals/:id/approve
  @Post('action-proposals/:id/approve')
  @RequiresPlatformPermission('platform.ai.approve_action')
  async approveProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approvePlatformAiActionProposalSchema))
    dto: ApprovePlatformAiActionProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.actionProposals.approve(id, dto, user.sub, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/copilot/action-proposals/:id/reject
  @Post('action-proposals/:id/reject')
  @RequiresPlatformPermission('platform.ai.read')
  async rejectProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectPlatformAiActionProposalSchema))
    dto: RejectPlatformAiActionProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.actionProposals.reject(id, dto, user.sub, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/copilot/agent-handoffs
  @Post('agent-handoffs')
  @RequiresPlatformPermission('platform.ai.read')
  async createHandoff(
    @Body(new ZodValidationPipe(createPlatformAgentHandoffSchema))
    dto: CreatePlatformAgentHandoffDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.actionProposals.createHandoff(
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  // GET /v1/admin/copilot/agent-handoffs/:id
  @Get('agent-handoffs/:id')
  @RequiresPlatformPermission('platform.ai.read')
  async getHandoff(@Param('id', ParseUUIDPipe) id: string) {
    return this.actionProposals.getHandoff(id);
  }
}
