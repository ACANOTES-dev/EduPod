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

import { listWhatsAppTemplatesQuerySchema, submitWhatsAppTemplateSchema } from '@school/shared';
import type {
  JwtPayload,
  ListWhatsAppTemplatesQueryDto,
  SubmitWhatsAppTemplateDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { WhatsAppTemplateService } from './whatsapp-template.service';

@Controller('v1/whatsapp-templates')
@UseGuards(AuthGuard, PermissionGuard)
export class WhatsAppTemplateController {
  constructor(private readonly templates: WhatsAppTemplateService) {}

  // POST /v1/whatsapp-templates
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('configuration.communications.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitWhatsAppTemplateSchema)) dto: SubmitWhatsAppTemplateDto,
  ) {
    return this.templates.createTemplate(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/whatsapp-templates
  @Get()
  @RequiresPermission('configuration.communications.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listWhatsAppTemplatesQuerySchema))
    query: ListWhatsAppTemplatesQueryDto,
  ) {
    return this.templates.listTemplates(
      tenant.tenant_id,
      {
        status: query.status,
        language_code: query.language_code,
        template_key: query.template_key,
      },
      query.page,
      query.pageSize,
    );
  }

  // POST /v1/whatsapp-templates/:id/submit
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.submitToTwilio(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/whatsapp-templates/:id/sync
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async sync(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.syncApprovalStatus(tenant.tenant_id, id);
  }

  // POST /v1/whatsapp-templates/:id/pause
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async pause(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.pauseTemplate(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/whatsapp-templates/:id/resume
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async resume(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.resumeTemplate(tenant.tenant_id, id, user.sub);
  }

  // GET /v1/whatsapp-templates/:id
  @Get(':id')
  @RequiresPermission('configuration.communications.manage')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getTemplate(tenant.tenant_id, id);
  }

  // DELETE /v1/whatsapp-templates/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('configuration.communications.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.templates.deleteTemplate(tenant.tenant_id, id, user.sub);
  }
}
