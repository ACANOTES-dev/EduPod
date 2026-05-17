import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import {
  createPlatformDeployEventSchema,
  listPlatformDeployEventsQuerySchema,
  platformRunbookQuerySchema,
  platformSeverityPolicyQuerySchema,
  platformTopologyQuerySchema,
  type CreatePlatformDeployEventDto,
  type ListPlatformDeployEventsQuery,
  type PlatformRunbookQuery,
  type PlatformSeverityPolicyQuery,
  type PlatformTopologyQuery,
} from '@school/shared';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformObservabilityService } from './platform-observability.service';

@Controller('v1/admin')
export class PlatformObservabilityController {
  constructor(private readonly observability: PlatformObservabilityService) {}

  // GET /v1/admin/correlation/:id
  @Get('correlation/:id')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async correlation(@Param('id') id: string) {
    return this.observability.listCorrelationEvents(id);
  }

  // GET /v1/admin/deploys
  @Get('deploys')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async deploys(
    @Query(new ZodValidationPipe(listPlatformDeployEventsQuerySchema))
    query: ListPlatformDeployEventsQuery,
  ) {
    return this.observability.listDeploys(query);
  }

  // GET /v1/admin/deploys/:id
  @Get('deploys/:id')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async deploy(@Param('id', ParseUUIDPipe) id: string) {
    return this.observability.getDeploy(id);
  }

  // GET /v1/admin/runbooks
  @Get('runbooks')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async runbooks(
    @Query(new ZodValidationPipe(platformRunbookQuerySchema)) query: PlatformRunbookQuery,
  ) {
    return this.observability.listRunbooks(query);
  }

  // GET /v1/admin/service-topology
  @Get('service-topology')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async topology(
    @Query(new ZodValidationPipe(platformTopologyQuerySchema)) query: PlatformTopologyQuery,
  ) {
    return this.observability.listTopology(query);
  }

  // GET /v1/admin/severity-policies
  @Get('severity-policies')
  @UseGuards(AuthGuard, PlatformRoleGuard)
  @RequiresPlatformPermission('platform.audit_log.view')
  async severityPolicies(
    @Query(new ZodValidationPipe(platformSeverityPolicyQuerySchema))
    query: PlatformSeverityPolicyQuery,
  ) {
    return this.observability.listSeverityPolicies(query);
  }

  // POST /v1/admin/_internal/deploy-events
  @Post('_internal/deploy-events')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit(
    'Internal CI deploy capture is authenticated by static token and is append-only.',
  )
  async captureDeploy(
    @Headers('x-internal-token') token: string | undefined,
    @Body(new ZodValidationPipe(createPlatformDeployEventSchema))
    dto: CreatePlatformDeployEventDto,
  ) {
    if (!this.observability.verifyInternalToken(token)) {
      throw new UnauthorizedException({
        code: 'INVALID_INTERNAL_TOKEN',
        message: 'Invalid deploy event internal token',
      });
    }
    return this.observability.captureDeploy(dto);
  }
}
