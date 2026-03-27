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
  UsePipes,
} from '@nestjs/common';
import {
  createTenantSchema,
  paginationQuerySchema,
  toggleModuleSchema,
  updateTenantSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import { PlatformOwnerGuard } from './guards/platform-owner.guard';
import { TenantsService } from './tenants.service';

const impersonateSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

type ImpersonateDto = z.infer<typeof impersonateSchema>;

const listTenantsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  search: z.string().optional(),
});

@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('tenants')
  @UsePipes(new ZodValidationPipe(createTenantSchema))
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.tenantsService.createTenant(dto);
  }

  @Get('tenants')
  async listTenants(
    @Query(new ZodValidationPipe(listTenantsQuerySchema))
    query: z.infer<typeof listTenantsQuerySchema>,
  ) {
    const { page, pageSize, sort, order, status, search } = query;
    return this.tenantsService.listTenants({ page, pageSize, sort, order }, { status, search });
  }

  @Get('tenants/:id')
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Patch('tenants/:id')
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(id, dto);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.suspendTenant(id);
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.reactivateTenant(id);
  }

  @Post('tenants/:id/archive')
  @HttpCode(HttpStatus.OK)
  async archiveTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.archiveTenant(id);
  }

  @Get('dashboard')
  async getDashboard() {
    return this.tenantsService.getDashboard();
  }

  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  @SensitiveDataAccess('cross_tenant', {
    entityIdField: 'user_id',
    entityType: 'impersonation',
  })
  async impersonate(
    @Body(new ZodValidationPipe(impersonateSchema)) dto: ImpersonateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantsService.impersonate(dto.tenant_id, dto.user_id, user.sub);
  }

  @Post('users/:id/reset-mfa')
  @HttpCode(HttpStatus.OK)
  async resetUserMfa(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.resetUserMfa(id, user.sub);
  }

  @Get('tenants/:id/modules')
  async listModules(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.listModules(id);
  }

  @Patch('tenants/:id/modules/:key')
  async toggleModule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(toggleModuleSchema)) dto: { is_enabled: boolean },
  ) {
    return this.tenantsService.toggleModule(id, key, dto.is_enabled);
  }
}
