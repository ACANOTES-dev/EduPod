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
import {
  createInterventionActionSchema,
  createPastoralInterventionProgressSchema,
  createPastoralInterventionSchema,
  interventionActionFiltersSchema,
  pastoralInterventionFiltersSchema,
  pastoralInterventionStatusTransitionSchema,
  recordReviewSchema,
  updateInterventionActionSchema,
  updatePastoralInterventionSchema,
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
import { InterventionActionService } from '../services/intervention-action.service';
import { InterventionService } from '../services/intervention.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class InterventionsController {
  constructor(
    private readonly interventionService: InterventionService,
    private readonly interventionActionService: InterventionActionService,
  ) {}

  // ─── Intervention Plans ─────────────────────────────────────────────────────

  // 1. List interventions (paginated, filterable)

  @Get('pastoral/interventions')
  @RequiresPermission('pastoral.manage_interventions')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(pastoralInterventionFiltersSchema))
    query: z.infer<typeof pastoralInterventionFiltersSchema>,
  ) {
    return this.interventionService.listInterventions(
      tenant.tenant_id,
      query,
    );
  }

  // 2. Get intervention detail

  @Get('pastoral/interventions/:id')
  @RequiresPermission('pastoral.manage_interventions')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interventionService.getIntervention(
      tenant.tenant_id,
      id,
    );
  }

  // 3. List interventions for case

  @Get('pastoral/cases/:caseId/interventions')
  @RequiresPermission('pastoral.manage_interventions')
  async listForCase(
    @CurrentTenant() tenant: TenantContext,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.interventionService.listInterventionsForCase(
      tenant.tenant_id,
      caseId,
    );
  }

  // 4. List interventions for student

  @Get('pastoral/students/:studentId/interventions')
  @RequiresPermission('pastoral.manage_interventions')
  async listForStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.interventionService.listInterventionsForStudent(
      tenant.tenant_id,
      studentId,
    );
  }

  // 5. Create intervention

  @Post('pastoral/interventions')
  @RequiresPermission('pastoral.manage_interventions')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPastoralInterventionSchema))
    dto: z.infer<typeof createPastoralInterventionSchema>,
  ) {
    return this.interventionService.createIntervention(
      tenant.tenant_id,
      dto,
      user.sub,
    );
  }

  // 6. Update intervention (active only)

  @Patch('pastoral/interventions/:id')
  @RequiresPermission('pastoral.manage_interventions')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePastoralInterventionSchema))
    dto: z.infer<typeof updatePastoralInterventionSchema>,
  ) {
    return this.interventionService.updateIntervention(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // 7. Change status

  @Patch('pastoral/interventions/:id/status')
  @RequiresPermission('pastoral.manage_interventions')
  async changeStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pastoralInterventionStatusTransitionSchema))
    dto: z.infer<typeof pastoralInterventionStatusTransitionSchema>,
  ) {
    return this.interventionService.changeStatus(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // 8. Record review

  @Post('pastoral/interventions/:id/review')
  @RequiresPermission('pastoral.manage_interventions')
  @HttpCode(HttpStatus.OK)
  async recordReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordReviewSchema))
    dto: z.infer<typeof recordReviewSchema>,
  ) {
    return this.interventionService.recordReview(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  // 9. List actions for intervention

  @Get('pastoral/interventions/:id/actions')
  @RequiresPermission('pastoral.manage_interventions')
  async listActionsForIntervention(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interventionActionService.listActionsForIntervention(
      tenant.tenant_id,
      id,
    );
  }

  // 10. List all actions

  @Get('pastoral/intervention-actions')
  @RequiresPermission('pastoral.manage_interventions')
  async listAllActions(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(interventionActionFiltersSchema))
    query: z.infer<typeof interventionActionFiltersSchema>,
  ) {
    return this.interventionActionService.listAllActions(
      tenant.tenant_id,
      query,
    );
  }

  // 11. My assigned actions

  @Get('pastoral/intervention-actions/my')
  @RequiresPermission('pastoral.manage_interventions')
  async myActions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.interventionActionService.listMyActions(
      tenant.tenant_id,
      user.sub,
    );
  }

  // 12. Create action

  @Post('pastoral/interventions/:id/actions')
  @RequiresPermission('pastoral.manage_interventions')
  @HttpCode(HttpStatus.CREATED)
  async createAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createInterventionActionSchema))
    dto: z.infer<typeof createInterventionActionSchema>,
  ) {
    return this.interventionActionService.createAction(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // 13. Update action

  @Patch('pastoral/intervention-actions/:id')
  @RequiresPermission('pastoral.manage_interventions')
  async updateAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInterventionActionSchema))
    dto: z.infer<typeof updateInterventionActionSchema>,
  ) {
    return this.interventionActionService.updateAction(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // 14. Complete action

  @Patch('pastoral/intervention-actions/:id/complete')
  @RequiresPermission('pastoral.manage_interventions')
  async completeAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interventionActionService.completeAction(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  // ─── Progress ───────────────────────────────────────────────────────────────

  // 15. List progress notes

  @Get('pastoral/interventions/:id/progress')
  @RequiresPermission('pastoral.manage_interventions')
  async listProgressNotes(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interventionService.listProgressNotes(
      tenant.tenant_id,
      id,
    );
  }

  // 16. Add progress note

  @Post('pastoral/interventions/:id/progress')
  @RequiresPermission('pastoral.manage_interventions')
  @HttpCode(HttpStatus.CREATED)
  async addProgressNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPastoralInterventionProgressSchema))
    dto: z.infer<typeof createPastoralInterventionProgressSchema>,
  ) {
    return this.interventionService.addProgressNote(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  // 17. List intervention types

  @Get('pastoral/settings/intervention-types')
  @RequiresPermission('pastoral.manage_interventions')
  async getInterventionTypes(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.interventionService.getInterventionTypes(
      tenant.tenant_id,
    );
  }
}
