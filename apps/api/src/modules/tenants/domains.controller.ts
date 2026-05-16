import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { DomainsService } from './domains.service';
import { createDomainSchema } from './dto/create-domain.dto';
import type { CreateDomainDto } from './dto/create-domain.dto';
import { updateDomainSchema } from './dto/update-domain.dto';
import type { UpdateDomainDto } from './dto/update-domain.dto';

@Controller('v1/admin/tenants/:tenantId/domains')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get()
  @RequiresPlatformPermission('platform.tenants.view')
  async listDomains(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.domainsService.listDomains(tenantId);
  }

  @Post()
  @RequiresPlatformPermission('platform.tenants.create')
  async addDomain(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(createDomainSchema)) dto: CreateDomainDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.domainsService.addDomain(tenantId, dto, auditContextFromRequest(user, request));
  }

  @Patch(':domainId')
  @RequiresPlatformPermission('platform.tenants.create')
  async updateDomain(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(updateDomainSchema)) dto: UpdateDomainDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.domainsService.updateDomain(
      tenantId,
      domainId,
      dto,
      auditContextFromRequest(user, request),
    );
  }

  @Delete(':domainId')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.create')
  async removeDomain(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.domainsService.removeDomain(
      tenantId,
      domainId,
      auditContextFromRequest(user, request),
    );
  }
}
