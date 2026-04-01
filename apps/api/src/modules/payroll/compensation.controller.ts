import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';

import {
  compensationQuerySchema,
  createCompensationSchema,
  updateCompensationSchema,
} from '@school/shared';
import type {
  CreateCompensationDto,
  JwtPayload,
  TenantContext,
  UpdateCompensationDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { CompensationService } from './compensation.service';

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('v1/payroll/compensation')
@UseGuards(AuthGuard, PermissionGuard)
export class CompensationController {
  constructor(private readonly compensationService: CompensationService) {}

  @Get()
  @RequiresPermission('payroll.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(compensationQuerySchema))
    query: z.infer<typeof compensationQuerySchema>,
  ) {
    return this.compensationService.listCompensation(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('payroll.view')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.compensationService.getCompensation(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCompensationSchema)) dto: CreateCompensationDto,
  ) {
    return this.compensationService.createCompensation(tenant.tenant_id, user.sub, dto);
  }

  @Put(':id')
  @RequiresPermission('payroll.manage_compensation')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCompensationSchema)) dto: UpdateCompensationDto,
  ) {
    return this.compensationService.updateCompensation(tenant.tenant_id, id, dto);
  }

  @Post('bulk-import')
  @RequiresPermission('payroll.manage_compensation')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(apiError('FILE_REQUIRED', 'A CSV file must be uploaded'));
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException(apiError('INVALID_FILE_TYPE', 'Only CSV files are accepted'));
    }

    return this.compensationService.bulkImport(tenant.tenant_id, user.sub, file.buffer);
  }
}
