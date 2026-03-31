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

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import {
  createSnaAssignmentSchema,
  type CreateSnaAssignmentDto,
} from './dto/create-sna-assignment.dto';
import { endSnaAssignmentSchema, type EndSnaAssignmentDto } from './dto/end-sna-assignment.dto';
import {
  listSnaAssignmentsQuerySchema,
  type ListSnaAssignmentsQuery,
} from './dto/list-sna-assignments.dto';
import {
  updateSnaAssignmentSchema,
  type UpdateSnaAssignmentDto,
} from './dto/update-sna-assignment.dto';
import { SenSnaService } from './sen-sna.service';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenSnaController {
  constructor(
    private readonly senSnaService: SenSnaService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  // POST /v1/sen/sna-assignments
  @Post('sen/sna-assignments')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage_resources')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSnaAssignmentSchema)) dto: CreateSnaAssignmentDto,
  ) {
    return this.senSnaService.create(tenant.tenant_id, dto);
  }

  // ─── List and detail lookups ──────────────────────────────────────────────

  // GET /v1/sen/sna-assignments
  @Get('sen/sna-assignments')
  @RequiresPermission('sen.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSnaAssignmentsQuerySchema)) query: ListSnaAssignmentsQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senSnaService.findAll(tenant.tenant_id, user.sub, permissions, query);
  }

  // GET /v1/sen/sna-assignments/by-sna/:staffId
  @Get('sen/sna-assignments/by-sna/:staffId')
  @RequiresPermission('sen.view')
  async findBySna(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senSnaService.findBySna(tenant.tenant_id, user.sub, permissions, staffId);
  }

  // GET /v1/sen/sna-assignments/by-student/:studentId
  @Get('sen/sna-assignments/by-student/:studentId')
  @RequiresPermission('sen.view')
  async findByStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senSnaService.findByStudent(tenant.tenant_id, user.sub, permissions, studentId);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  // PATCH /v1/sen/sna-assignments/:id
  @Patch('sen/sna-assignments/:id')
  @RequiresPermission('sen.manage_resources')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSnaAssignmentSchema)) dto: UpdateSnaAssignmentDto,
  ) {
    return this.senSnaService.update(tenant.tenant_id, id, dto);
  }

  // PATCH /v1/sen/sna-assignments/:id/end
  @Patch('sen/sna-assignments/:id/end')
  @RequiresPermission('sen.manage_resources')
  async endAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(endSnaAssignmentSchema)) dto: EndSnaAssignmentDto,
  ) {
    return this.senSnaService.endAssignment(tenant.tenant_id, id, dto);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
