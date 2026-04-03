import {
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

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  finaliseDocumentSchema,
  generateDocumentSchema,
  listDocumentsQuerySchema,
  sendDocumentSchema,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourDocumentService } from './behaviour-document.service';

@Controller('v1/behaviour/documents')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourDocumentsController {
  constructor(private readonly documentService: BehaviourDocumentService) {}

  @Post('generate')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async generateDocument(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(generateDocumentSchema))
    dto: ReturnType<typeof generateDocumentSchema.parse>,
  ) {
    return this.documentService.generateDocument(tenant.tenant_id, user.sub, dto);
  }

  @Get()
  @RequiresPermission('behaviour.view')
  async listDocuments(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema))
    query: ReturnType<typeof listDocumentsQuerySchema.parse>,
  ) {
    return this.documentService.listDocuments(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('behaviour.view')
  async getDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.getDocument(tenant.tenant_id, id);
  }

  @Patch(':id/finalise')
  @RequiresPermission('behaviour.manage')
  async finaliseDocument(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(finaliseDocumentSchema))
    dto: ReturnType<typeof finaliseDocumentSchema.parse>,
  ) {
    return this.documentService.finaliseDocument(tenant.tenant_id, user.sub, id, dto.notes);
  }

  @Post(':id/send')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async sendDocument(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendDocumentSchema))
    dto: ReturnType<typeof sendDocumentSchema.parse>,
  ) {
    return this.documentService.sendDocument(tenant.tenant_id, user.sub, id, dto);
  }

  @Get(':id/download')
  @RequiresPermission('behaviour.view')
  async downloadDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentService.getDownloadUrl(tenant.tenant_id, id);
  }
}
