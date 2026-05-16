import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createPlatformErrorRedactionRuleSchema,
  platformErrorLogQuerySchema,
  previewPlatformErrorRedactionRuleSchema,
  type CreatePlatformErrorRedactionRuleDto,
  type JwtPayload,
  type PlatformErrorLogQuery,
  type PreviewPlatformErrorRedactionRuleDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformErrorLogService } from './platform-error-log.service';

@Controller('v1/admin/platform-error-log')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformErrorLogController {
  constructor(private readonly platformErrorLogService: PlatformErrorLogService) {}

  // GET /v1/admin/platform-error-log
  @Get()
  @RequiresPlatformPermission('platform.audit_log.view')
  async list(
    @Query(new ZodValidationPipe(platformErrorLogQuerySchema)) query: PlatformErrorLogQuery,
  ) {
    return this.platformErrorLogService.listRedacted(query);
  }

  // GET /v1/admin/platform-error-log/redaction-rules
  @Get('redaction-rules')
  @RequiresPlatformPermission('platform.platform_users.view')
  async listRules() {
    return this.platformErrorLogService.listRules();
  }

  // POST /v1/admin/platform-error-log/redaction-rules
  @Post('redaction-rules')
  @RequiresPlatformPermission('platform.platform_users.assign_roles')
  async createRule(
    @Body(new ZodValidationPipe(createPlatformErrorRedactionRuleSchema))
    dto: CreatePlatformErrorRedactionRuleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.platformErrorLogService.createRule(dto, user.sub);
  }

  // POST /v1/admin/platform-error-log/redaction-rules/preview
  @Post('redaction-rules/preview')
  @RequiresPlatformPermission('platform.platform_users.assign_roles')
  async preview(
    @Body(new ZodValidationPipe(previewPlatformErrorRedactionRuleSchema))
    dto: PreviewPlatformErrorRedactionRuleDto,
  ) {
    return this.platformErrorLogService.preview(dto);
  }

  // DELETE /v1/admin/platform-error-log/redaction-rules/:id
  @Delete('redaction-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.platform_users.assign_roles')
  async deleteRule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.platformErrorLogService.deleteRule(id, user.sub);
  }
}
