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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  addStudentToCaseSchema,
  caseFiltersSchema,
  caseOwnershipTransferSchema,
  caseStatusTransitionSchema,
  createCaseSchema,
  linkConcernToCaseSchema,
  updateCaseSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CaseQueriesService } from '../services/case-queries.service';
import { CaseService } from '../services/case.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class CasesController {
  constructor(
    private readonly caseService: CaseService,
    private readonly caseQueriesService: CaseQueriesService,
  ) {}

  // ─── 1. Create Case ────────────────────────────────────────────────────────

  @Post('pastoral/cases')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCaseSchema))
    dto: z.infer<typeof createCaseSchema>,
  ) {
    return this.caseService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── 2. List Cases ─────────────────────────────────────────────────────────

  @Get('pastoral/cases')
  @RequiresPermission('pastoral.manage_cases')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(caseFiltersSchema))
    query: z.infer<typeof caseFiltersSchema>,
  ) {
    return this.caseQueriesService.findAll(tenant.tenant_id, user.sub, query);
  }

  // ─── 3. My Cases ───────────────────────────────────────────────────────────

  @Get('pastoral/cases/my')
  @RequiresPermission('pastoral.manage_cases')
  async myCases(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.caseQueriesService.findMyCases(tenant.tenant_id, user.sub);
  }

  // ─── 4. Orphan Detection ───────────────────────────────────────────────────

  @Get('pastoral/cases/orphans')
  @RequiresPermission('pastoral.manage_cases')
  async orphans(@CurrentTenant() tenant: TenantContext) {
    return this.caseQueriesService.findOrphans(tenant.tenant_id);
  }

  // ─── 5. Get Case By ID ─────────────────────────────────────────────────────

  @Get('pastoral/cases/:id')
  @RequiresPermission('pastoral.manage_cases')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.caseQueriesService.findById(tenant.tenant_id, user.sub, id);
  }

  // ─── 6. Update Case ────────────────────────────────────────────────────────

  @Patch('pastoral/cases/:id')
  @RequiresPermission('pastoral.manage_cases')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCaseSchema))
    dto: z.infer<typeof updateCaseSchema>,
  ) {
    return this.caseService.update(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 7. Transition Status ──────────────────────────────────────────────────

  @Patch('pastoral/cases/:id/status')
  @RequiresPermission('pastoral.manage_cases')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(caseStatusTransitionSchema))
    dto: z.infer<typeof caseStatusTransitionSchema>,
  ) {
    return this.caseService.transition(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 8. Transfer Ownership ─────────────────────────────────────────────────

  @Post('pastoral/cases/:id/transfer')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.OK)
  async transferOwnership(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(caseOwnershipTransferSchema))
    dto: z.infer<typeof caseOwnershipTransferSchema>,
  ) {
    return this.caseService.transferOwnership(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 9. Link Concern to Case ───────────────────────────────────────────────

  @Post('pastoral/cases/:id/concerns')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.OK)
  async linkConcern(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(linkConcernToCaseSchema))
    dto: z.infer<typeof linkConcernToCaseSchema>,
  ) {
    return this.caseService.linkConcern(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 10. Unlink Concern from Case ──────────────────────────────────────────

  @Delete('pastoral/cases/:id/concerns/:concernId')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkConcern(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('concernId', ParseUUIDPipe) concernId: string,
  ) {
    return this.caseService.unlinkConcern(tenant.tenant_id, user.sub, id, concernId);
  }

  // ─── 11. Add Student to Case ───────────────────────────────────────────────

  @Post('pastoral/cases/:id/students')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.OK)
  async addStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addStudentToCaseSchema))
    dto: z.infer<typeof addStudentToCaseSchema>,
  ) {
    return this.caseService.addStudent(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 12. Remove Student from Case ──────────────────────────────────────────

  @Delete('pastoral/cases/:id/students/:studentId')
  @RequiresPermission('pastoral.manage_cases')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.caseService.removeStudent(tenant.tenant_id, user.sub, id, studentId);
  }
}
