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
  UseGuards,
} from '@nestjs/common';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

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
  ) {
    return this.domainsService.addDomain(tenantId, dto);
  }

  @Patch(':domainId')
  @RequiresPlatformPermission('platform.tenants.create')
  async updateDomain(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Body(new ZodValidationPipe(updateDomainSchema)) dto: UpdateDomainDto,
  ) {
    return this.domainsService.updateDomain(tenantId, domainId, dto);
  }

  @Delete(':domainId')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.create')
  async removeDomain(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('domainId', ParseUUIDPipe) domainId: string,
  ) {
    return this.domainsService.removeDomain(tenantId, domainId);
  }
}
