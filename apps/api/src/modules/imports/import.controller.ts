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
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  importFilterSchema,
  importUploadSchema,
} from '@school/shared';
import type {
  ImportFilterDto,
  ImportType,
  ImportUploadDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ImportService } from './import.service';

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const templateQuerySchema = z.object({
  import_type: z.enum(['students', 'parents', 'staff', 'fees', 'exam_results', 'staff_compensation']),
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Controller('v1/imports')
@UseGuards(AuthGuard, PermissionGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('upload')
  @RequiresPermission('settings.manage')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body(new ZodValidationPipe(importUploadSchema)) body: ImportUploadDto,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A CSV file must be uploaded',
      });
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only CSV files are accepted',
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File size must not exceed 10MB',
      });
    }

    return this.importService.upload(
      tenant.tenant_id,
      user.sub,
      file.buffer,
      file.originalname,
      body.import_type as ImportType,
    );
  }

  @Get()
  @RequiresPermission('settings.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(importFilterSchema))
    query: ImportFilterDto,
  ) {
    return this.importService.list(tenant.tenant_id, query);
  }

  @Get('template')
  @RequiresPermission('settings.manage')
  async getTemplate(
    @Query(new ZodValidationPipe(templateQuerySchema))
    query: z.infer<typeof templateQuerySchema>,
    @Res() res: Response,
  ) {
    const csv = this.importService.getTemplate(query.import_type as ImportType);
    const filename = `${query.import_type}_template.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get(':id')
  @RequiresPermission('settings.manage')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importService.get(tenant.tenant_id, id);
  }

  @Post(':id/confirm')
  @RequiresPermission('settings.manage')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importService.confirm(tenant.tenant_id, id);
  }
}
