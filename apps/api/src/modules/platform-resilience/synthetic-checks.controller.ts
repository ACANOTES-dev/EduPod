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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createSyntheticCheckDefinitionSchema,
  type CreateSyntheticCheckDefinitionDto,
  type JwtPayload,
  syntheticCheckListQuerySchema,
  type SyntheticCheckListQuery,
  syntheticCheckResultsQuerySchema,
  type SyntheticCheckResultsQuery,
  updateSyntheticCheckDefinitionSchema,
  type UpdateSyntheticCheckDefinitionDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';
import { SyntheticChecksService } from './synthetic-checks.service';

@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class SyntheticChecksController {
  constructor(
    private readonly checks: SyntheticChecksService,
    private readonly runner: SyntheticCheckRunnerService,
    private readonly audit: PlatformAuditService,
  ) {}

  // GET /v1/admin/synthetic-checks
  @Get('synthetic-checks')
  @RequiresPlatformPermission('platform.synthetic.view')
  async list(
    @Query(new ZodValidationPipe(syntheticCheckListQuerySchema)) query: SyntheticCheckListQuery,
  ) {
    return this.checks.list(query);
  }

  // POST /v1/admin/synthetic-checks
  @Post('synthetic-checks')
  @RequiresPlatformPermission('platform.synthetic.manage')
  async create(
    @Body(new ZodValidationPipe(createSyntheticCheckDefinitionSchema))
    dto: CreateSyntheticCheckDefinitionDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.checks.create(dto, user.sub, auditContextFromRequest(user, request));
  }

  // GET /v1/admin/synthetic-checks/:id
  @Get('synthetic-checks/:id')
  @RequiresPlatformPermission('platform.synthetic.view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.checks.get(id);
  }

  // PATCH /v1/admin/synthetic-checks/:id
  @Patch('synthetic-checks/:id')
  @RequiresPlatformPermission('platform.synthetic.manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSyntheticCheckDefinitionSchema))
    dto: UpdateSyntheticCheckDefinitionDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.checks.update(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/synthetic-checks/:id
  @Delete('synthetic-checks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.synthetic.manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    await this.checks.remove(id, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/synthetic-checks/:id/run-now
  @Post('synthetic-checks/:id/run-now')
  @RequiresPlatformPermission('platform.synthetic.run')
  async runNow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const result = await this.runner.run(id, { triggered_by: 'run_now', user_id: user.sub });
    await this.audit.log({
      ...auditContextFromRequest(user, request),
      action: 'synthetic_check_run_now',
      payload: { after: { result_id: result.id, status: result.status } },
      target_resource_id: id,
      target_resource_type: 'synthetic_check',
    });
    return result;
  }

  // GET /v1/admin/synthetic-checks/:id/results
  @Get('synthetic-checks/:id/results')
  @RequiresPlatformPermission('platform.synthetic.view')
  async listResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(syntheticCheckResultsQuerySchema))
    query: SyntheticCheckResultsQuery,
  ) {
    return this.checks.listResults(id, query);
  }

  // GET /v1/admin/synthetic-checks/results/:resultId
  @Get('synthetic-checks/results/:resultId')
  @RequiresPlatformPermission('platform.synthetic.view')
  async getResult(@Param('resultId', ParseUUIDPipe) resultId: string) {
    return this.checks.getResult(resultId);
  }

  // GET /v1/admin/external-dependencies
  @Get('external-dependencies')
  @RequiresPlatformPermission('platform.synthetic.view')
  async externalDependencies() {
    return this.checks.externalDependencies();
  }

  // GET /v1/admin/certificates
  @Get('certificates')
  @RequiresPlatformPermission('platform.synthetic.view')
  async certificates() {
    return this.checks.certificates();
  }
}
