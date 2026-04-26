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

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  createEventBudgetScenarioSchema,
  createEventBudgetSchema,
  eventBudgetQuerySchema,
  updateEventBudgetScenarioSchema,
  updateEventBudgetSchema,
  type CreateEventBudgetDto,
  type CreateEventBudgetScenarioDto,
  type EventBudgetQueryDto,
  type UpdateEventBudgetDto,
  type UpdateEventBudgetScenarioDto,
} from '@school/shared/budgeting';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';
import { EventBudgetsService } from './event-budgets.service';

@Controller('v1/budgeting/event-budgets')
@UseGuards(AuthGuard, PermissionGuard)
export class EventBudgetsController {
  constructor(
    private readonly events: EventBudgetsService,
    private readonly scenarios: EventBudgetScenariosService,
  ) {}

  // GET /v1/budgeting/event-budgets
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(eventBudgetQuerySchema)) query: EventBudgetQueryDto,
  ) {
    return this.events.findAll(tenant.tenant_id, query);
  }

  // GET /v1/budgeting/event-budgets/:id
  @Get(':id')
  @RequiresPermission('budgeting.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.findOne(tenant.tenant_id, id);
  }

  // POST /v1/budgeting/event-budgets
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createEventBudgetSchema)) dto: CreateEventBudgetDto,
  ) {
    return this.events.create(tenant.tenant_id, user.sub, dto);
  }

  // PATCH /v1/budgeting/event-budgets/:id
  @Patch(':id')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEventBudgetSchema)) dto: UpdateEventBudgetDto,
  ) {
    return this.events.update(tenant.tenant_id, user.sub, id, dto);
  }

  // POST /v1/budgeting/event-budgets/:id/confirm
  @Post(':id/confirm')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.confirm(tenant.tenant_id, user.sub, id);
  }

  // POST /v1/budgeting/event-budgets/:id/cancel
  @Post(':id/cancel')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.cancel(tenant.tenant_id, user.sub, id);
  }

  // POST /v1/budgeting/event-budgets/:id/complete
  @Post(':id/complete')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.complete(tenant.tenant_id, user.sub, id);
  }

  // DELETE /v1/budgeting/event-budgets/:id  (drafts only)
  @Delete(':id')
  @RequiresPermission('budgeting.archive')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.remove(tenant.tenant_id, user.sub, id);
  }

  // ─── Scenarios ─────────────────────────────────────────────────────────

  // GET /v1/budgeting/event-budgets/:id/scenarios
  @Get(':id/scenarios')
  @RequiresPermission('budgeting.view')
  async listScenarios(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scenarios.findAll(tenant.tenant_id, id);
  }

  // GET /v1/budgeting/event-budgets/:id/scenarios/:sid
  @Get(':id/scenarios/:sid')
  @RequiresPermission('budgeting.view')
  async findScenario(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.scenarios.findOne(tenant.tenant_id, id, sid);
  }

  // POST /v1/budgeting/event-budgets/:id/scenarios
  @Post(':id/scenarios')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async createScenario(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createEventBudgetScenarioSchema))
    dto: CreateEventBudgetScenarioDto,
  ) {
    return this.scenarios.create(tenant.tenant_id, user.sub, id, dto);
  }

  // PATCH /v1/budgeting/event-budgets/:id/scenarios/:sid
  @Patch(':id/scenarios/:sid')
  @RequiresPermission('budgeting.manage')
  async updateScenario(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body(new ZodValidationPipe(updateEventBudgetScenarioSchema))
    dto: UpdateEventBudgetScenarioDto,
  ) {
    return this.scenarios.update(tenant.tenant_id, user.sub, id, sid, dto);
  }

  // DELETE /v1/budgeting/event-budgets/:id/scenarios/:sid
  @Delete(':id/scenarios/:sid')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async removeScenario(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.scenarios.remove(tenant.tenant_id, user.sub, id, sid);
  }
}
