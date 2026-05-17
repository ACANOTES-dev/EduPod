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

import {
  createAlertEscalationPolicySchema,
  type CreateAlertEscalationPolicyDto,
  createAlertRouteSchema,
  type CreateAlertRouteDto,
  type JwtPayload,
  testAlertRouteSchema,
  type TestAlertRouteDto,
  updateAlertEscalationPolicySchema,
  type UpdateAlertEscalationPolicyDto,
  updateAlertRouteSchema,
  type UpdateAlertRouteDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { AlertEscalationPoliciesService } from './alert-escalation-policies.service';
import { AlertRoutesService } from './alert-routes.service';
import { AlertTestRateLimitService } from './alert-test-rate-limit.service';

@Controller('v1/admin/alerts')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AlertRoutingController {
  constructor(
    private readonly routes: AlertRoutesService,
    private readonly policies: AlertEscalationPoliciesService,
    private readonly rateLimit: AlertTestRateLimitService,
  ) {}

  // GET /v1/admin/alerts/routes
  @Get('routes')
  @RequiresPlatformPermission('platform.alerts.view')
  async listRoutes() {
    return this.routes.list();
  }

  // POST /v1/admin/alerts/routes
  @Post('routes')
  @RequiresPlatformPermission('platform.alerts.manage')
  async createRoute(
    @Body(new ZodValidationPipe(createAlertRouteSchema)) dto: CreateAlertRouteDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.routes.create(dto, auditContextFromRequest(user, request));
  }

  // PATCH /v1/admin/alerts/routes/:id
  @Patch('routes/:id')
  @RequiresPlatformPermission('platform.alerts.manage')
  async updateRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertRouteSchema)) dto: UpdateAlertRouteDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.routes.update(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/alerts/routes/:id
  @Delete('routes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.alerts.manage')
  async deleteRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<void> {
    await this.routes.remove(id, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/alerts/routes/:id/test
  @Post('routes/:id/test')
  @RequiresPlatformPermission('platform.alerts.manage')
  async testRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(testAlertRouteSchema)) dto: TestAlertRouteDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.routes.test(id, user.sub, dto, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/alerts/test-all
  @Post('test-all')
  @RequiresPlatformPermission('platform.alerts.manage')
  async testAll(@CurrentUser() user: JwtPayload, @Req() request: Request) {
    await this.rateLimit.assertCanTestAll(user.sub, auditContextFromRequest(user, request));
    const routes = await this.routes.list();
    const results = [];
    for (const route of routes.filter((item) => item.enabled)) {
      results.push(await this.routes.test(route.id, user.sub, {}, undefined));
    }
    return { results };
  }

  // GET /v1/admin/alerts/escalation-policies
  @Get('escalation-policies')
  @RequiresPlatformPermission('platform.alerts.view')
  async listPolicies() {
    return this.policies.list();
  }

  // POST /v1/admin/alerts/escalation-policies
  @Post('escalation-policies')
  @RequiresPlatformPermission('platform.alerts.manage')
  async createPolicy(
    @Body(new ZodValidationPipe(createAlertEscalationPolicySchema))
    dto: CreateAlertEscalationPolicyDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.policies.create(dto, user.sub, auditContextFromRequest(user, request));
  }

  // PATCH /v1/admin/alerts/escalation-policies/:id
  @Patch('escalation-policies/:id')
  @RequiresPlatformPermission('platform.alerts.manage')
  async updatePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertEscalationPolicySchema))
    dto: UpdateAlertEscalationPolicyDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.policies.update(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/alerts/escalation-policies/:id
  @Delete('escalation-policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.alerts.manage')
  async deletePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<void> {
    await this.policies.remove(id, auditContextFromRequest(user, request));
  }

  // GET /v1/admin/alerts/route-health
  @Get('route-health')
  @RequiresPlatformPermission('platform.alerts.view')
  async routeHealth() {
    return this.routes.routeHealth();
  }
}
