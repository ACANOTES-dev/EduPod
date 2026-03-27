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
  addAffectedPersonSchema,
  addExternalSupportSchema,
  addResponsePlanItemSchema,
  affectedPersonFiltersSchema,
  bulkAddAffectedSchema,
  createCriticalIncidentSchema,
  criticalIncidentFiltersSchema,
  recordSupportOfferedSchema,
  transitionCriticalIncidentStatusSchema,
  updateAffectedPersonSchema,
  updateCriticalIncidentSchema,
  updateResponsePlanItemSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import type { DeclareIncidentDto } from '../services/critical-incident.service';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AffectedTrackingService } from '../services/affected-tracking.service';
import { CriticalIncidentService } from '../services/critical-incident.service';

const removeAffectedReasonSchema = z.object({
  reason: z.string().min(1),
});

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class CriticalIncidentsController {
  constructor(
    private readonly incidentService: CriticalIncidentService,
    private readonly affectedService: AffectedTrackingService,
  ) {}

  // ─── 1. Declare Incident ──────────────────────────────────────────────────

  @Post('pastoral/critical-incidents')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCriticalIncidentSchema))
    dto: DeclareIncidentDto,
  ) {
    return this.incidentService.declare(
      tenant.tenant_id,
      user.sub,
      dto,
    );
  }

  // ─── 2. List Incidents ────────────────────────────────────────────────────

  @Get('pastoral/critical-incidents')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(criticalIncidentFiltersSchema))
    query: z.infer<typeof criticalIncidentFiltersSchema>,
  ) {
    const { page, pageSize, ...filters } = query;
    return this.incidentService.list(
      tenant.tenant_id,
      filters,
      page,
      pageSize,
    );
  }

  // ─── 3. Get Incident Detail ───────────────────────────────────────────────

  @Get('pastoral/critical-incidents/:id')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidentService.getById(tenant.tenant_id, id);
  }

  // ─── 4. Update Incident ───────────────────────────────────────────────────

  @Patch('pastoral/critical-incidents/:id')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCriticalIncidentSchema))
    dto: z.infer<typeof updateCriticalIncidentSchema>,
  ) {
    return this.incidentService.update(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 5. Transition Status ────────────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/status')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.OK)
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionCriticalIncidentStatusSchema))
    dto: z.infer<typeof transitionCriticalIncidentStatusSchema>,
  ) {
    return this.incidentService.transitionStatus(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 6. Get Response Plan ────────────────────────────────────────────────

  @Get('pastoral/critical-incidents/:id/response-plan')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async getResponsePlan(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidentService.getResponsePlanProgress(
      tenant.tenant_id,
      id,
    );
  }

  // ─── 7. Update Response Plan Item ────────────────────────────────────────

  @Patch('pastoral/critical-incidents/:id/response-plan/items/:itemId')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async updateResponsePlanItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) _itemId: string,
    @Body(new ZodValidationPipe(updateResponsePlanItemSchema))
    dto: z.infer<typeof updateResponsePlanItemSchema>,
  ) {
    return this.incidentService.updateResponsePlanItem(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 8. Add Response Plan Item ───────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/response-plan/items')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.CREATED)
  async addResponsePlanItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addResponsePlanItemSchema))
    dto: z.infer<typeof addResponsePlanItemSchema>,
  ) {
    return this.incidentService.addResponsePlanItem(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 9. List Affected Persons ────────────────────────────────────────────

  @Get('pastoral/critical-incidents/:id/affected')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async listAffected(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(affectedPersonFiltersSchema))
    filters: z.infer<typeof affectedPersonFiltersSchema>,
  ) {
    return this.affectedService.listAffectedPersons(
      tenant.tenant_id,
      id,
      filters,
    );
  }

  // ─── 10. Add Affected Person ─────────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/affected')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.CREATED)
  async addAffected(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addAffectedPersonSchema))
    dto: z.infer<typeof addAffectedPersonSchema>,
  ) {
    return this.affectedService.addAffectedPerson(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 11. Bulk Add Affected ───────────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/affected/bulk')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.CREATED)
  async bulkAddAffected(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(bulkAddAffectedSchema))
    dto: z.infer<typeof bulkAddAffectedSchema>,
  ) {
    return this.affectedService.bulkAddAffected(
      tenant.tenant_id,
      id,
      user.sub,
      dto.persons,
    );
  }

  // ─── 12. Update Affected Person ──────────────────────────────────────────

  @Patch('pastoral/critical-incidents/:id/affected/:personId')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async updateAffected(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body(new ZodValidationPipe(updateAffectedPersonSchema))
    dto: z.infer<typeof updateAffectedPersonSchema>,
  ) {
    return this.affectedService.updateAffectedPerson(
      tenant.tenant_id,
      personId,
      user.sub,
      dto,
    );
  }

  // ─── 13. Remove Affected Person ──────────────────────────────────────────

  @Delete('pastoral/critical-incidents/:id/affected/:personId')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAffected(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body(new ZodValidationPipe(removeAffectedReasonSchema))
    dto: z.infer<typeof removeAffectedReasonSchema>,
  ) {
    await this.affectedService.removeAffectedPerson(
      tenant.tenant_id,
      personId,
      user.sub,
      dto.reason,
    );
  }

  // ─── 14. Record Support Offered ──────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/affected/:personId/support')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.OK)
  async recordSupport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body(new ZodValidationPipe(recordSupportOfferedSchema))
    dto: z.infer<typeof recordSupportOfferedSchema>,
  ) {
    return this.affectedService.recordSupportOffered(
      tenant.tenant_id,
      personId,
      user.sub,
      dto.notes,
    );
  }

  // ─── 15. Affected Summary ────────────────────────────────────────────────

  @Get('pastoral/critical-incidents/:id/affected/summary')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async affectedSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.affectedService.getAffectedSummary(
      tenant.tenant_id,
      id,
    );
  }

  // ─── 16. List External Support ───────────────────────────────────────────

  @Get('pastoral/critical-incidents/:id/external-support')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async listExternalSupport(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidentService.listExternalSupport(
      tenant.tenant_id,
      id,
    );
  }

  // ─── 17. Add External Support ────────────────────────────────────────────

  @Post('pastoral/critical-incidents/:id/external-support')
  @RequiresPermission('pastoral.manage_critical_incidents')
  @HttpCode(HttpStatus.CREATED)
  async addExternalSupport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addExternalSupportSchema))
    dto: z.infer<typeof addExternalSupportSchema>,
  ) {
    return this.incidentService.addExternalSupport(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── 18. Update External Support ─────────────────────────────────────────

  @Patch('pastoral/critical-incidents/:id/external-support/:entryId')
  @RequiresPermission('pastoral.manage_critical_incidents')
  async updateExternalSupport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body(new ZodValidationPipe(addExternalSupportSchema))
    dto: z.infer<typeof addExternalSupportSchema>,
  ) {
    return this.incidentService.updateExternalSupport(
      tenant.tenant_id,
      id,
      entryId,
      user.sub,
      dto,
    );
  }

  // ─── 19. Student Wellbeing Flags ─────────────────────────────────────────

  @Get('pastoral/students/:studentId/wellbeing-flags')
  @RequiresPermission('pastoral.view')
  async getStudentWellbeingFlags(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.affectedService.getStudentWellbeingFlags(
      tenant.tenant_id,
      studentId,
    );
  }
}
