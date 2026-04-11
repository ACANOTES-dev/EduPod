import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import { editMessageSchema } from '@school/shared/inbox';
import type { EditMessageDto } from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { MessagesService } from './messages.service';

/**
 * MessagesController — edit + soft-delete at the per-message level.
 *
 *   PATCH  /v1/inbox/messages/:id     edit within window
 *   DELETE /v1/inbox/messages/:id     soft delete
 */
@Controller('v1/inbox/messages')
@UseGuards(AuthGuard, PermissionGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.send')
  async edit(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(editMessageSchema)) dto: EditMessageDto,
  ) {
    const tenantId = requireTenant(tenantContext);
    return this.messages.editMessage({
      tenantId,
      userId: user.sub,
      messageId,
      newBody: dto.body,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.send')
  async delete(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) messageId: string,
  ) {
    const tenantId = requireTenant(tenantContext);
    return this.messages.deleteMessage({
      tenantId,
      userId: user.sub,
      messageId,
    });
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
