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
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import {
  createAccommodationBodySchema,
  type CreateAccommodationBody,
} from './dto/create-accommodation.dto';
import { examReportQuerySchema, type ExamReportQuery } from './dto/exam-report-query.dto';
import {
  listAccommodationsQuerySchema,
  type ListAccommodationsQuery,
} from './dto/list-accommodations.dto';
import {
  updateAccommodationSchema,
  type UpdateAccommodationDto,
} from './dto/update-accommodation.dto';
import { SenAccommodationService } from './sen-accommodation.service';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenAccommodationController {
  constructor(private readonly senAccommodationService: SenAccommodationService) {}

  // ─── Exam Report (static — must precede dynamic :id routes) ──────────────

  // GET /v1/sen/accommodations/exam-report
  @Get('sen/accommodations/exam-report')
  @RequiresPermission('sen.admin')
  async getExamReport(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(examReportQuerySchema)) query: ExamReportQuery,
  ) {
    return this.senAccommodationService.getExamReport(tenant.tenant_id, query);
  }

  // ─── Profile-scoped CRUD ─────────────────────────────────────────────────

  // POST /v1/sen/profiles/:profileId/accommodations
  @Post('sen/profiles/:profileId/accommodations')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body(new ZodValidationPipe(createAccommodationBodySchema)) dto: CreateAccommodationBody,
  ) {
    return this.senAccommodationService.create(tenant.tenant_id, profileId, dto);
  }

  // GET /v1/sen/profiles/:profileId/accommodations
  @Get('sen/profiles/:profileId/accommodations')
  @RequiresPermission('sen.view')
  async findAllByProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query(new ZodValidationPipe(listAccommodationsQuerySchema)) query: ListAccommodationsQuery,
  ) {
    return this.senAccommodationService.findAllByProfile(tenant.tenant_id, profileId, query);
  }

  // ─── Flat accommodation routes ───────────────────────────────────────────

  // PATCH /v1/sen/accommodations/:id
  @Patch('sen/accommodations/:id')
  @RequiresPermission('sen.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAccommodationSchema)) dto: UpdateAccommodationDto,
  ) {
    return this.senAccommodationService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/sen/accommodations/:id
  @Delete('sen/accommodations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('sen.manage')
  async delete(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.senAccommodationService.delete(tenant.tenant_id, id);
  }
}
