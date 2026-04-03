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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  createCpRecordSchema,
  listCpRecordsQuerySchema,
  updateCpRecordSchema,
} from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CpAccessGuard } from '../guards/cp-access.guard';
import { CpRecordService } from '../services/cp-record.service';

@Controller('v1/child-protection')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, CpAccessGuard)
export class CpRecordsController {
  constructor(private readonly cpRecordService: CpRecordService) {}

  // ─── 1. Create CP Record ──────────────────────────────────────────────────

  @Post('cp-records')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCpRecordSchema))
    dto: z.infer<typeof createCpRecordSchema>,
    @Req() req: Request,
  ) {
    return this.cpRecordService.create(tenant.tenant_id, user.sub, dto, req.ip ?? null);
  }

  // ─── 2. List CP Records ───────────────────────────────────────────────────

  @Get('cp-records')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listCpRecordsQuerySchema))
    query: z.infer<typeof listCpRecordsQuerySchema>,
    @Req() req: Request,
  ) {
    return this.cpRecordService.listByStudent(tenant.tenant_id, user.sub, query, req.ip ?? null);
  }

  // ─── 3. Get CP Record By ID ───────────────────────────────────────────────

  @Get('cp-records/:id')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.cpRecordService.getById(tenant.tenant_id, user.sub, id, req.ip ?? null);
  }

  // ─── 4. Update CP Record Metadata ─────────────────────────────────────────

  @Patch('cp-records/:id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCpRecordSchema))
    dto: z.infer<typeof updateCpRecordSchema>,
    @Req() req: Request,
  ) {
    return this.cpRecordService.update(tenant.tenant_id, user.sub, id, dto, req.ip ?? null);
  }
}
